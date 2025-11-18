import express from 'express';
import {
  getExams,
  getExam,
  addExam,
  updateExam,
  deleteExam,
} from '../controllers/examController.js';
import { protect, lecturer } from '../middleware/authMiddleware.js';
import { validateExam } from '../middleware/validation.js';

const router = express.Router();

// GET routes for fetching exams
router.route('/').get(protect, getExams).post(protect, lecturer, validateExam, addExam);
router.route('/:id').get(protect, getExam).put(protect, lecturer, validateExam, updateExam).delete(protect, lecturer, deleteExam);

export default router;
