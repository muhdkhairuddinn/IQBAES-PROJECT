import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import UserSecurity from '../models/UserSecurity.js';
import UserEnrollments from '../models/UserEnrollments.js';

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      
      // Check if token exists and is not empty
      if (!token || token === 'null' || token === 'undefined') {
        return res.status(401).json({ message: 'Not authorized, no token' });
      }
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      
      if (!user) {
        return res.status(401).json({ message: 'Not authorized, user not found' });
      }
      
      // Check if user is active
      const userSecurity = await UserSecurity.findOne({ userId: user._id });
      if (!userSecurity || !userSecurity.isActive) {
        return res.status(401).json({ message: 'Account is deactivated' });
      }
      
      // Get user's enrolled courses
      const userEnrollments = await UserEnrollments.find({ userId: user._id });
      const enrolledCourseIds = userEnrollments.map(enrollment => enrollment.courseId.toString());
      
      // Add enrolledCourseIds to user object
      req.user = {
        ...user.toJSON(),
        enrolledCourseIds
      };
      
      next();
    } catch (error) {
      console.error('JWT Error:', error.message);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  } else {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
};

const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as an admin' });
  }
};

const lecturer = (req, res, next) => {
  if (req.user && (req.user.role === 'lecturer' || req.user.role === 'admin')) {
      next();
  } else {
      res.status(403).json({ message: 'Not authorized as a lecturer' });
  }
};

// Role-based authorization middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized, no user found' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: `User role '${req.user.role}' is not authorized to access this route` 
      });
    }
    
    next();
  };
};

export { protect, admin, lecturer, authorize };
