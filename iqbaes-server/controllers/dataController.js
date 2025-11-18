import User from '../models/User.js';
import UserEnrollments from '../models/UserEnrollments.js';
import Course from '../models/Course.js';
import Exam from '../models/Exam.js';
import Submission from '../models/Submission.js';
import SystemLogs from '../models/SystemLogs.js';
import BankQuestion from '../models/BankQuestion.js';

// @desc    Get all initial data for the application
// @route   GET /api/bootstrap
// @access  Private
const getBootstrapData = async (req, res) => {
  try {
    // Safety check for req.user
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { role, enrolledCourseIds } = req.user;
    
    console.log('🔍 BOOTSTRAP DEBUG:');
    console.log('- User role:', role);
    console.log('- enrolledCourseIds from middleware:', enrolledCourseIds);

    let users = [];
    let courses = [];
    let exams = [];
    let submissions = [];
    let logs = [];
    let bankQuestions = [];

    if (role === 'admin') {
      [users, courses, exams, submissions, logs, bankQuestions] = await Promise.all([
        User.find({}),
        Course.find({}),
        Exam.find({}),
        Submission.find({}).populate('userId', 'name'),
        SystemLogs.find({}).sort({ timestamp: -1 }),
        BankQuestion.find({}),
      ]);
    } else if (role === 'lecturer') {
      [users, courses, exams, submissions, logs, bankQuestions] = await Promise.all([
        User.find({}), // Lecturers can see all users for results
        Course.find({ _id: { $in: enrolledCourseIds } }),
        Exam.find({ courseId: { $in: enrolledCourseIds } }),
        Submission.find({ courseId: { $in: enrolledCourseIds } }).populate('userId', 'name'),
        SystemLogs.find({ 'userId': req.user.id }).sort({ timestamp: -1 }),
        BankQuestion.find({ courseId: { $in: enrolledCourseIds } }),
      ]);
    } else { // student
      [courses, exams, submissions, logs, bankQuestions] = await Promise.all([
        Course.find({ _id: { $in: enrolledCourseIds } }),
        Exam.find({ courseId: { $in: enrolledCourseIds } }),
        Submission.find({ userId: req.user.id }),
        SystemLogs.find({ userId: req.user.id }).sort({ timestamp: -1 }),
        BankQuestion.find({ courseId: { $in: enrolledCourseIds } }),
      ]);
      users = [req.user]; 
    }
    
    // Populate enrolledCourseIds for all users (needed for RetakeManagementModal)
    if (users.length > 0) {
      const allUserEnrollments = await UserEnrollments.find({});
      const enrollmentsByUser = {};
      
      allUserEnrollments.forEach(enrollment => {
        const userId = enrollment.userId.toString();
        if (!enrollmentsByUser[userId]) {
          enrollmentsByUser[userId] = [];
        }
        enrollmentsByUser[userId].push(enrollment.courseId.toString());
      });
      
      users = users.map(user => {
        // For students, req.user is a plain object with 'id', for others it's a Mongoose doc with '_id'
        const userId = user._id?.toString() || user.id?.toString();
        return {
          ...(user.toJSON ? user.toJSON() : user),
          enrolledCourseIds: enrollmentsByUser[userId] || []
        };
      });
    }
    
    // Add enrolledCourseIds to the current user object (req.user is already a plain object from middleware)
    const userWithEnrollments = {
      ...req.user,
      enrolledCourseIds
    };

    res.json({
      user: userWithEnrollments,
      users: users, // Already processed with enrolledCourseIds
      courses: courses.map(c => c.toJSON()),
      exams: exams.map(e => e.toJSON()),
      submissions: submissions.map(s => s.toJSON()),
      logs: logs.map(l => l.toJSON()),
      bankQuestions: bankQuestions.map(bq => bq.toJSON()),
    });

  } catch (error) {
    console.error('Bootstrap error:', error);
    res.status(500).json({ message: 'Server error fetching initial data.' });
  }
};

export { getBootstrapData };