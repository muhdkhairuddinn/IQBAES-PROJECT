import express from 'express';
import {
  addCourse,
  updateCourse,
  deleteCourse,
} from '../controllers/courseController.js';
import { protect, admin } from '../middleware/authMiddleware.js';
import { validateCourse } from '../middleware/validation.js';

const router = express.Router();

router.route('/').post(protect, admin, validateCourse, addCourse);
router.route('/:id').put(protect, admin, validateCourse, updateCourse).delete(protect, admin, deleteCourse);

export default router;
