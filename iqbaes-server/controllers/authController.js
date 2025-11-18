import User from '../models/User.js';
import UserSecurity from '../models/UserSecurity.js';
import UserEnrollments from '../models/UserEnrollments.js';
import PasswordReset from '../models/PasswordReset.js';
import SystemLogs from '../models/SystemLogs.js';
import jwt from 'jsonwebtoken';
import { logFailedLogin, logSuccessfulLogin, logAccountLocked } from '../middleware/logging.js';
import { sendPasswordResetEmail } from '../utils/emailService.js';
import { getClientIp } from '../utils/getClientIp.js';

const generateAccessToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '15m', // Fixed: 15 minutes instead of 30 days
  });
};

const generateRefreshToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, {
    expiresIn: '7d', // 7 days for refresh token
  });
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  const { username, password } = req.body;

  // Basic validation (password required but length check done during auth)
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  try {
    const user = await User.findOne({ username: username.toLowerCase() });
    
    if (!user) {
      // Log failed login attempt
      try {
        const failedLoginLog = new SystemLogs({
          type: 'login_failed',
          userId: null,
          userName: username.toLowerCase(),
          level: 'warn',
          message: `Failed login attempt for non-existent username: ${username.toLowerCase()}`,
          details: {
            module: 'auth',
            username: username.toLowerCase(),
            reason: 'user_not_found',
            ipAddress: getClientIp(req),
            userAgent: req.get('User-Agent') || 'unknown'
          }
        });
        await failedLoginLog.save();
      } catch (logError) {
        console.error('Failed to log failed login attempt:', logError);
      }
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Get user security data
    const userSecurity = await UserSecurity.findOne({ userId: user._id });
    
    if (!userSecurity) {
      return res.status(401).json({ message: 'Security data not found' });
    }

    // Check if account is locked (CRITICAL SECURITY CHECK)
    const isLocked = userSecurity.lockUntil && userSecurity.lockUntil > Date.now();
    if (isLocked) {
      const lockExpiry = new Date(userSecurity.lockUntil);
      const timeRemaining = Math.ceil((lockExpiry - Date.now()) / (1000 * 60)); // minutes
      
      // Log locked account login attempt
      try {
        const lockedLoginLog = new SystemLogs({
          type: 'login_failed',
          userId: user._id,
          userName: user.name || user.username,
          level: 'warn',
          message: `Login attempt blocked - Account locked for user: ${user.name || user.username}`,
          details: {
            module: 'auth',
            username: username.toLowerCase(),
            reason: 'account_locked',
            lockUntil: userSecurity.lockUntil,
            timeRemainingMinutes: timeRemaining,
            ipAddress: getClientIp(req),
            userAgent: req.get('User-Agent') || 'unknown'
          }
        });
        await lockedLoginLog.save();
      } catch (logError) {
        console.error('Failed to log locked account attempt:', logError);
      }
      
      // Use HTTP 423 (Locked) which is the standard status code for locked resources
      return res.status(423).json({ 
        message: `Account is locked due to too many failed login attempts. Please contact an administrator or try again in ${timeRemaining} minute(s).` 
      });
    }

    if (userSecurity && (await userSecurity.matchPassword(password))) {
      // Store user info for consolidated logger to access
      req.loggedInUser = {
        id: user._id.toString(),
        username: user.username,
        source: 'login'
      };
      
      const accessToken = generateAccessToken(user._id);
      const refreshToken = generateRefreshToken(user._id);
      
      // Update last login time and reset failed attempts
      userSecurity.lastLogin = new Date();
      userSecurity.loginAttempts = 0; // Reset failed attempts
      userSecurity.lockUntil = undefined; // Clear any lock
      await userSecurity.save();
      
      // Log successful login to database
      try {
        const displayName = user.name || user.username;
        const loginLog = new SystemLogs({
          type: 'login',
          userId: user._id,
          userName: displayName,
          level: 'info',
          message: `User ${displayName} logged in successfully`,
          details: {
            module: 'auth',
            method: req.method || 'POST',
            url: req.originalUrl || '/api/auth/login',
            username: user.username,
            name: user.name,
            ipAddress: getClientIp(req),
            userAgent: req.get('User-Agent') || 'unknown',
            statusCode: 200
          }
        });
      await loginLog.save();
      
      // Emit real-time login event to admin dashboard
      try {
        const { getIO } = await import('../socket.js');
        const io = getIO();
        if (io) {
          io.to('admin_dashboard').emit('user_login', {
            userId: user._id.toString(),
            userName: displayName,
            timestamp: new Date().toISOString()
          });
        }
      } catch (socketError) {
        console.error('Failed to emit login event:', socketError);
      }
    } catch (logError) {
      console.error('Failed to log successful login:', logError);
    }
    
    // Set refresh token as httpOnly cookie with fixed 7 days
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // Fixed 7 days
      });

      // Get user's enrolled courses
      const userEnrollments = await UserEnrollments.find({ userId: user._id });
      const enrolledCourseIds = userEnrollments.map(enrollment => enrollment.courseId.toString());
      
      // Add enrolledCourseIds to user object
      const userWithEnrollments = {
        ...user.toJSON(),
        enrolledCourseIds
      };

      res.json({
        user: userWithEnrollments,
        accessToken: accessToken,
        refreshToken: refreshToken,
        expiresIn: '15m'
      });
    } else {
      // Increment failed login attempts
      if (userSecurity) {
        userSecurity.loginAttempts = (userSecurity.loginAttempts || 0) + 1;
        
        // Lock account after 5 failed attempts using lockUntil timestamp
        let accountJustLocked = false;
        if (userSecurity.loginAttempts >= 5 && !userSecurity.lockUntil) {
          const lockTime = 2 * 60 * 60 * 1000; // 2 hours
          userSecurity.lockUntil = new Date(Date.now() + lockTime);
          accountJustLocked = true;
          
          // Log account lock event to MongoDB
          try {
            const lockLog = new SystemLogs({
              type: 'login_failed',
              userId: user._id,
              userName: user.name || user.username,
              level: 'error',
              message: `Account locked after 5 failed login attempts for user: ${user.name || user.username}`,
              details: {
                module: 'auth',
                username: username.toLowerCase(),
                reason: 'too_many_failed_attempts',
                lockUntil: userSecurity.lockUntil,
                ipAddress: getClientIp(req),
                userAgent: req.get('User-Agent') || 'unknown'
              }
            });
            await lockLog.save();
          } catch (logError) {
            console.error('Failed to log account lock:', logError);
          }
        }
        
        await userSecurity.save();
        
        // If account was just locked, use 423 status to indicate locked account
        if (accountJustLocked) {
          // Log failed login attempt to database
          try {
            const displayName = user.name || username.toLowerCase();
            const failedLoginLog = new SystemLogs({
              type: 'login_failed',
              userId: user._id,
              userName: displayName,
              level: 'error',
              message: `Failed login attempt - Account locked for user: ${displayName}`,
              details: {
                module: 'auth',
                username: username.toLowerCase(),
                name: user.name,
                attempts: userSecurity.loginAttempts,
                locked: true,
                ipAddress: getClientIp(req),
                userAgent: req.get('User-Agent') || 'unknown'
              }
            });
            await failedLoginLog.save();
          } catch (logError) {
            console.error('Failed to log failed login attempt:', logError);
          }
          
          // Mark as account locked for consolidated logger
          res.accountJustLocked = true;
          return res.status(423).json({ message: 'Account locked due to too many failed login attempts. Please contact an administrator.' });
        }
      }
      
      // Log failed login attempt to database (for non-locked failures)
      try {
        const displayName = user.name || username.toLowerCase();
        const failedLoginLog = new SystemLogs({
          type: 'login_failed',
          userId: user._id,
          userName: displayName,
          level: 'warn',
          message: `Failed login attempt for user: ${displayName}`,
          details: {
            module: 'auth',
            username: username.toLowerCase(),
            name: user.name,
            attempts: userSecurity ? userSecurity.loginAttempts : 1,
            ipAddress: getClientIp(req),
            userAgent: req.get('User-Agent') || 'unknown'
          }
        });
        await failedLoginLog.save();
      } catch (logError) {
        console.error('Failed to log failed login attempt:', logError);
      }
      
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  const { name, username, password, role } = req.body;

  try {
    const userExists = await User.findOne({ username: username.toLowerCase() });

    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create user profile
    const user = await User.create({
      name,
      username: username.toLowerCase(),
      role,
    });

    if (user) {
      // Create separate security record
      const userSecurity = await UserSecurity.create({
        userId: user._id,
        password, // Password will be hashed by the pre-save hook in UserSecurity model
        lastLogin: null,
        loginAttempts: 0,
        isLocked: false,
        twoFactorEnabled: false
      });
      
      // Store user info for consolidated logger to access
      req.loggedInUser = {
        id: user._id.toString(),
        username: user.username,
        source: 'registration'
      };
      
      // Log user creation to database
      try {
        const userCreatedLog = new SystemLogs({
          type: 'registration',
          userId: user._id,
          userName: user.username,
          level: 'info',
          message: `New user registered: ${user.username} with role: ${user.role}`,
          details: {
            module: 'auth',
            username: user.username,
            role: user.role,
            ipAddress: getClientIp(req),
            userAgent: req.get('User-Agent') || 'unknown'
          }
        });
        await userCreatedLog.save();
      } catch (logError) {
        console.error('Failed to log user creation:', logError);
      }
      
      const accessToken = generateAccessToken(user._id);
      const refreshToken = generateRefreshToken(user._id);
      
      // Set refresh token as httpOnly cookie
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      // Get user's enrolled courses (will be empty for new users)
      const userEnrollments = await UserEnrollments.find({ userId: user._id });
      const enrolledCourseIds = userEnrollments.map(enrollment => enrollment.courseId.toString());
      
      // Add enrolledCourseIds to user object
      const userWithEnrollments = {
        ...user.toJSON(),
        enrolledCourseIds
      };

      res.status(201).json({
        user: userWithEnrollments,
        accessToken: accessToken,
        refreshToken: refreshToken,
        expiresIn: '15m'
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    console.error('Registration Error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

// @desc    Refresh access token
// @route   POST /api/auth/refresh
// @access  Public
const refreshToken = async (req, res) => {
  try {
    const refreshTokenValue = req.body?.refreshToken || req.headers['x-refresh-token'] ||
      (req.headers.authorization && req.headers.authorization.startsWith('Bearer') ? req.headers.authorization.split(' ')[1] : null) ||
      req.cookies?.refreshToken;

    if (!refreshTokenValue) {
      return res.status(401).json({ message: 'Refresh token not found' });
    }

    const decoded = jwt.verify(refreshTokenValue, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    // Get user security data to check password change and active status
    const userSecurity = await UserSecurity.findOne({ userId: user._id });
    
    if (!userSecurity || !userSecurity.isActive) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }
    
    if (userSecurity && userSecurity.changedPasswordAfter(decoded.iat)) {
      return res.status(401).json({ message: 'Password changed. Please login again.' });
    }

    const newAccessToken = generateAccessToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);

    // Set new refresh token as httpOnly cookie (backward compatibility)
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Get user's enrolled courses
    const userEnrollments = await UserEnrollments.find({ userId: user._id });
    const enrolledCourseIds = userEnrollments.map(enrollment => enrollment.courseId.toString());
    
    // Add enrolledCourseIds to user object
    const userWithEnrollments = {
      ...user.toJSON(),
      enrolledCourseIds
    };

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: userWithEnrollments,
      expiresIn: '15m'
    });
  } catch (error) {
    console.error('Refresh Token Error:', error);
    console.error('Error stack:', error.stack);
    res.status(401).json({ message: 'Invalid refresh token' });
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Public
const logoutUser = async (req, res) => {
  // Log logout event to database if user info is available
  if (req.user) {
    try {
      const displayName = req.user.name || req.user.username;
      const logoutLog = new SystemLogs({
        type: 'logout',
        userId: req.user.id || req.user._id,
        userName: displayName,
        level: 'info',
        message: `User ${displayName} logged out`,
        details: {
          module: 'auth',
          method: req.method || 'POST',
          url: req.originalUrl || '/api/auth/logout',
          username: req.user.username,
          name: req.user.name,
          ipAddress: getClientIp(req),
          userAgent: req.get('User-Agent') || 'unknown',
          statusCode: 200
        }
      });
      await logoutLog.save();
      
      // Emit real-time logout event to admin dashboard
      try {
        const { getIO } = await import('../socket.js');
        const io = getIO();
        if (io) {
          io.to('admin_dashboard').emit('user_logout', {
            userId: req.user.id || req.user._id,
            userName: displayName,
            timestamp: new Date().toISOString()
          });
        }
      } catch (socketError) {
        console.error('Failed to emit logout event:', socketError);
      }
    } catch (logError) {
      console.error('Failed to log logout:', logError);
    }
  }
  
  res.cookie('refreshToken', '', {
    httpOnly: true,
    expires: new Date(0)
  });
  
  res.json({ message: 'Logged out successfully' });
};

// @desc    Request password reset
// @route   POST /api/auth/request-password-reset
// @access  Public
const requestPasswordReset = async (req, res) => {
  const { email } = req.body;
  
  try {
    // Find user by email
    const user = await User.findOne({ username: email.toLowerCase() });
    
    if (!user) {
      // For security, don't reveal if email exists or not
      return res.json({ 
        message: 'If an account with that email exists, we have sent a password reset link.' 
      });
    }
    
    // Get client IP and user agent for security logging
    const ipAddress = getClientIp(req);
    const userAgent = req.get('User-Agent') || 'unknown';
    
    // Create reset token
    const resetToken = await PasswordReset.createResetToken(
      user._id, 
      user.username, 
      ipAddress, 
      userAgent
    );
    
    // Send email
    await sendPasswordResetEmail(user.username, resetToken);
    
    // Log the password reset request to database
    try {
      const resetRequestLog = new SystemLogs({
        type: 'password_reset_request',
        userId: user._id,
        userName: user.username,
        level: 'info',
        message: `Password reset requested for user: ${user.username}`,
        details: {
          module: 'auth',
          username: user.username,
          ipAddress: ipAddress,
          userAgent: userAgent
        }
      });
      await resetRequestLog.save();
    } catch (logError) {
      console.error('Failed to log password reset request:', logError);
    }
    
    console.log(`Password reset requested for user: ${user.username} from IP: ${ipAddress}`);
    
    res.json({ 
      message: 'If an account with that email exists, we have sent a password reset link.' 
    });
    
  } catch (error) {
    console.error('Password reset request error:', error);
    
    // Check if it's an email sending error
    if (error.message.includes('Failed to send')) {
      return res.status(500).json({ 
        message: 'Unable to send password reset email. Please try again later or contact support.' 
      });
    }
    
    res.status(500).json({ 
      message: 'Server error during password reset request' 
    });
  }
};

// @desc    Reset password with token
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;
  
  try {
    // Verify the reset token
    const resetRecord = await PasswordReset.verifyResetToken(token);
    
    if (!resetRecord) {
      return res.status(400).json({ 
        message: 'Invalid or expired reset token' 
      });
    }
    
    // Get the user
    const user = await User.findById(resetRecord.userId);
    
    if (!user) {
      return res.status(400).json({ 
        message: 'User not found' 
      });
    }
    
    // Update user's password
    user.password = newPassword; // The User model should hash this automatically
    await user.save();
    
    // Mark the reset token as used
    await PasswordReset.markTokenAsUsed(token);
    
    // Log the successful password reset to database
    try {
      const resetCompleteLog = new SystemLogs({
        userId: user._id,
        level: 'info',
        message: `Password successfully reset for user: ${user.username}`,
        module: 'auth',
        metadata: {
          username: user.username,
          ipAddress: getClientIp(req),
          userAgent: req.get('User-Agent') || 'unknown'
        },
        timestamp: new Date()
      });
      await resetCompleteLog.save();
    } catch (logError) {
      console.error('Failed to log password reset completion:', logError);
    }
    
    console.log(`Password successfully reset for user: ${user.username}`);
    
    res.json({ 
      message: 'Password has been reset successfully. You can now log in with your new password.' 
    });
    
  } catch (error) {
    console.error('Password reset error:', error);
    
    if (error.message.includes('Invalid or expired')) {
      return res.status(400).json({ 
        message: 'Invalid or expired reset token. Please request a new password reset.' 
      });
    }
    
    res.status(500).json({ 
      message: 'Server error during password reset' 
    });
  }
};

export { loginUser, registerUser, refreshToken, logoutUser, requestPasswordReset, resetPassword };
