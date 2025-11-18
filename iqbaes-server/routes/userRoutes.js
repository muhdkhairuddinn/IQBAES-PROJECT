import express from 'express';
import {
  addUser,
  updateUser,
  deleteUser,
  unlockUserAccount,
  getUserProfile,
  updateUserProfile,
  getDashboardStats,
} from '../controllers/userController.js';
import { protect, admin } from '../middleware/authMiddleware.js';
import { validateUser } from '../middleware/validation.js';

const router = express.Router();

// Debug middleware
router.use((req, res, next) => {
  console.log('[DEBUG] User route accessed:', req.method, req.path);
  next();
});

// User profile routes (protected)
router.route('/profile')
  .get(protect, getUserProfile)
  .put(protect, validateUser, updateUserProfile);

// Dashboard stats route (protected)
router.route('/dashboard-stats')
  .get(protect, getDashboardStats);

// Admin routes
router.route('/').post(protect, admin, validateUser, addUser);
router.route('/:id').put(protect, admin, validateUser, updateUser).delete(protect, admin, deleteUser);
router.route('/:id/unlock').post(protect, admin, unlockUserAccount);

export default router;
