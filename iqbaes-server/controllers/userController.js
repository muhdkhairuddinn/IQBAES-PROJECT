import User from '../models/User.js';
import UserSecurity from '../models/UserSecurity.js';
import UserEnrollments from '../models/UserEnrollments.js';
import Submission from '../models/Submission.js';
import Exam from '../models/Exam.js';
import SystemLogs from '../models/SystemLogs.js';
import { getClientIp } from '../utils/getClientIp.js';

// @desc    Add a new user
// @route   POST /api/users
// @access  Private/Admin
const addUser = async (req, res) => {
  const { name, username, password, role, enrolledCourseIds } = req.body;
  try {
    const userExists = await User.findOne({ username: username.toLowerCase() });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }
    
    // Create user profile
    const user = await User.create({ name, username: username.toLowerCase(), role });
    
    // Create security record
    await UserSecurity.create({
      userId: user._id,
      password,
      lastLogin: null,
      loginAttempts: 0,
      isLocked: false,
      twoFactorEnabled: false
    });
    
    // Create enrollments if provided
    if (enrolledCourseIds && enrolledCourseIds.length > 0) {
      const enrollments = enrolledCourseIds.map(courseId => ({
        userId: user._id,
        courseId,
        enrolledAt: new Date(),
        status: 'active',
        progress: 0,
        grade: null
      }));
      await UserEnrollments.insertMany(enrollments);
    }
    
    res.status(201).json(user.toJSON());
  } catch (error) {
    res.status(400).json({ message: 'Invalid user data', details: error.message });
  }
};

// @desc    Update a user
// @route   PUT /api/users/:id
// @access  Private/Admin
const updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (user) {
      user.name = req.body.name || user.name;
      user.username = req.body.username || user.username;
      user.role = req.body.role || user.role;
      
      // Handle password update in UserSecurity
      if(req.body.password) {
        const userSecurity = await UserSecurity.findOne({ userId: user._id });
        if (userSecurity) {
          userSecurity.password = req.body.password;
          await userSecurity.save();
        }
      }
      
      // Handle enrollment updates
      if (req.body.enrolledCourseIds !== undefined) {
        // Remove existing enrollments
        await UserEnrollments.deleteMany({ userId: user._id });
        
        // Add new enrollments
        if (req.body.enrolledCourseIds.length > 0) {
          const enrollments = req.body.enrolledCourseIds.map(courseId => ({
            userId: user._id,
            courseId,
            enrolledAt: new Date(),
            status: 'active',
            progress: 0,
            grade: null
          }));
          await UserEnrollments.insertMany(enrollments);
        }
      }
      
      const updatedUser = await user.save();
      
      // Log user update to database
      try {
        const userUpdatedLog = new SystemLogs({
          userId: req.user.id || req.user._id,
          level: 'info',
          message: `User updated: ${updatedUser.username} (Name: ${updatedUser.name}, Role: ${updatedUser.role})`,
          module: 'user_management',
          metadata: {
            updatedUserId: updatedUser._id.toString(),
            updatedUsername: updatedUser.username,
            adminUsername: req.user.username,
            ipAddress: getClientIp(req),
            userAgent: req.get('User-Agent') || 'unknown'
          },
          timestamp: new Date()
        });
        await userUpdatedLog.save();
      } catch (logError) {
        console.error('Failed to log user update:', logError);
      }
      
      res.json(updatedUser.toJSON());
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(400).json({ message: 'Error updating user', details: error.message });
  }
};

// @desc    Unlock a user account
// @route   POST /api/users/:id/unlock
// @access  Private/Admin
const unlockUserAccount = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userSecurity = await UserSecurity.findOne({ userId: user._id });
    if (!userSecurity) {
      return res.status(404).json({ message: 'User security record not found' });
    }

    // Check if account is actually locked
    const isLocked = userSecurity.lockUntil && userSecurity.lockUntil > Date.now();
    if (!isLocked) {
      return res.json({ 
        message: 'Account is not currently locked',
        user: user.toJSON()
      });
    }

    // Unlock the account
    userSecurity.lockUntil = undefined;
    userSecurity.loginAttempts = 0;
    await userSecurity.save();

    // Log the unlock action (simple format for activity logs)
    try {
      const unlockLog = new SystemLogs({
        type: 'admin_unlock_account',
        userId: req.user.id || req.user._id,
        userName: req.user.name || req.user.username || 'Admin',
        level: 'info',
        message: `Account unlocked: ${user.name || user.username}`,
        details: {
          unlockedUserId: user._id.toString(),
          unlockedUsername: user.username,
          unlockedUserName: user.name
        },
        timestamp: new Date(),
        ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      });
      await unlockLog.save();
    } catch (logError) {
      console.error('Failed to log account unlock:', logError);
    }

    res.json({
      message: 'Account unlocked successfully',
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Error unlocking account:', error);
    res.status(500).json({ 
      message: 'Failed to unlock account', 
      details: error.message 
    });
  }
};

// @desc    Delete a user
// @route   DELETE /api/users/:id
// @access  Private/Admin
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (user) {
      const deletedUserInfo = { username: user.username, name: user.name, role: user.role };
      await User.deleteOne({ _id: req.params.id });
      
      // Log user deletion to database
      try {
        const userDeletedLog = new SystemLogs({
          userId: req.user.id,
          userName: req.user.username,
          type: 'user_deleted',
          message: `User deleted: ${deletedUserInfo.username} (Name: ${deletedUserInfo.name}, Role: ${deletedUserInfo.role})`,
          details: {
            deletedUserId: req.params.id,
            deletedUsername: deletedUserInfo.username,
            deletedUserName: deletedUserInfo.name,
            deletedUserRole: deletedUserInfo.role
          },
          timestamp: new Date(),
          ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown'
        });
        await userDeletedLog.save();
      } catch (logError) {
        console.error('Failed to log user deletion:', logError);
      }
      
      res.json({ message: 'User removed' });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', details: error.message });
  }
};

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    console.log('[DEBUG] getUserProfile called, user ID:', req.user?._id);
    const user = await User.findById(req.user.id || req.user._id).select('-password');
    if (user) {
      console.log('[DEBUG] User found:', user.name);
      res.json(user.toJSON());
    } else {
      console.log('[DEBUG] User not found');
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error('[DEBUG] getUserProfile error:', error);
    res.status(500).json({ message: 'Server error', details: error.message });
  }
};

// @desc    Get dashboard statistics
// @route   GET /api/users/dashboard-stats
// @access  Private
const getDashboardStats = async (req, res) => {
  try {
    console.log('[DEBUG] getDashboardStats called, user ID:', req.user?._id);
    const userId = req.user.id || req.user._id;
    
    // Get user's submissions
    const submissions = await Submission.find({ userId });
    console.log('[DEBUG] Found submissions:', submissions.length);
    
    // Get available exams for the user's enrolled courses
    const user = await User.findById(userId);
    console.log('[DEBUG] User enrolled courses:', user.enrolledCourseIds);
    
    const availableExams = await Exam.find({ 
      courseId: { $in: user.enrolledCourseIds } 
    });
    console.log('[DEBUG] Available exams:', availableExams.length);
    
    // Calculate statistics
    const completedExams = submissions.length;
    const totalExams = availableExams.length;
    const pendingExams = totalExams - completedExams;
    
    // Calculate average score
    let averageScore = 0;
    if (submissions.length > 0) {
      const totalScore = submissions.reduce((sum, submission) => sum + (submission.score || 0), 0);
      averageScore = Math.round(totalScore / submissions.length);
    }
    
    const stats = {
      completedExams,
      totalExams,
      pendingExams,
      averageScore,
    };
    
    console.log('[DEBUG] Returning stats:', stats);
    res.json(stats);
  } catch (error) {
    console.error('[DEBUG] getDashboardStats error:', error);
    res.status(500).json({ message: 'Server error', details: error.message });
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id || req.user._id);
    if (user) {
      user.name = req.body.name || user.name;
      
      // Handle password update in UserSecurity
      if (req.body.password) {
        const userSecurity = await UserSecurity.findOne({ userId: user._id });
        if (userSecurity) {
          userSecurity.password = req.body.password;
          await userSecurity.save();
        }
      }
      
      const updatedUser = await user.save();
      
      // Log user profile update to database
      try {
        const userProfileUpdatedLog = new SystemLogs({
          userId: req.user.id || req.user._id,
          level: 'info',
          message: `User profile updated: ${updatedUser.username} (Name: ${updatedUser.name})`,
          module: 'user_profile',
          metadata: {
            username: updatedUser.username,
            ipAddress: getClientIp(req),
            userAgent: req.get('User-Agent') || 'unknown'
          },
          timestamp: new Date()
        });
        await userProfileUpdatedLog.save();
      } catch (logError) {
        console.error('Failed to log user profile update:', logError);
      }
      
      res.json(updatedUser.toJSON());
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(400).json({ message: 'Error updating profile', details: error.message });
  }
};

export { 
  addUser, 
  updateUser, 
  deleteUser, 
  unlockUserAccount,
  getUserProfile, 
  updateUserProfile, 
  getDashboardStats 
};
