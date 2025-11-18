import express from 'express';
import {
  createSubmission,
  getSubmissions,
  updateSubmission,
  allowRetake,
  allowRetakeForStudent,
  revokeRetake,
  startExamSession,
  getLiveMonitoringSessions,
  getAnalytics,
  bulkGradeSubmissions
} from '../controllers/submissionController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// @desc    Create a new submission
// @route   POST /api/submissions
// @access  Private/Student
router.post('/', protect, authorize('student'), createSubmission);

// @desc    Get all submissions (admin/lecturer)
// @route   GET /api/submissions
// @access  Private/Admin/Lecturer
router.get('/', protect, authorize('admin', 'lecturer'), getSubmissions);

// @desc    Get analytics data for lecturer dashboard
// @route   GET /api/submissions/analytics
// @access  Private/Admin/Lecturer
router.get('/analytics', protect, authorize('admin', 'lecturer'), getAnalytics);

// CRITICAL: More specific routes MUST come before generic /:id route
// Otherwise, Express will match /:id first and treat "revoke-retake" as the ID parameter

// @desc    Bulk grade multiple submissions
// @route   PUT /api/submissions/bulk-grade
// @access  Private/Admin/Lecturer
router.put('/bulk-grade', protect, authorize('admin', 'lecturer'), bulkGradeSubmissions);

// @desc    Allow retake for a student (creates submission if needed)
// @route   POST /api/submissions/allow-retake
// @access  Private/Admin/Lecturer
router.post('/allow-retake', protect, authorize('admin', 'lecturer'), allowRetakeForStudent);

// @desc    Allow retake for a submission
// @route   PUT /api/submissions/:id/allow-retake
// @access  Private/Admin/Lecturer
router.put('/:id/allow-retake', protect, authorize('admin', 'lecturer'), allowRetake);

// @desc    Revoke retake for a submission
// @route   PUT /api/submissions/:id/revoke-retake
// @access  Private/Admin/Lecturer
router.put('/:id/revoke-retake', protect, authorize('admin', 'lecturer'), revokeRetake);

// @desc    Update submission
// @route   PUT /api/submissions/:id
// @access  Private/Admin/Lecturer
router.put('/:id', protect, authorize('admin', 'lecturer'), updateSubmission);

// Note: The following routes are commented out because the corresponding controller functions don't exist:
// router.get('/:id', protect, getSubmissionById);
// router.delete('/:id', protect, authorize('admin'), deleteSubmission);
// router.get('/exam/:examId', protect, authorize('admin', 'lecturer'), getSubmissionsByExam);
// router.get('/user/:userId', protect, getSubmissionsByUser);
// router.put('/:id/grade', protect, authorize('admin', 'lecturer'), gradeSubmission);

// @desc    Start an exam session
// @route   POST /api/submissions/start-session
// @access  Private/Student
router.post('/start-session', protect, authorize('student'), startExamSession);

// @desc    Get active live exam sessions from LiveExamSession
// @route   GET /api/submissions/active-sessions
// @access  Private/Admin/Lecturer
router.get('/active-sessions', protect, authorize('admin', 'lecturer'), getLiveMonitoringSessions);

export default router;