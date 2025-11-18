import express from 'express';
import {
  createFeedback,
  getAllFeedback,
  getMyFeedback,
  updateFeedback,
  getFeedbackStats,
  markFeedbackAsRead,
  getUnreadCount,
  addComment,
  deleteFeedback
} from '../controllers/feedbackController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// User routes
router.post('/', createFeedback);
router.get('/my', getMyFeedback);
router.get('/unread-count', getUnreadCount);
router.put('/:id/mark-read', markFeedbackAsRead);
router.delete('/:id', deleteFeedback); // Users can delete their own feedback

// Admin only routes
router.get('/stats', admin, getFeedbackStats);
router.get('/', admin, getAllFeedback);
router.put('/:id', admin, updateFeedback);
router.post('/:id/comment', admin, addComment);

export default router;