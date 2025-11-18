import express from 'express';
import {
  addQuestionToBank,
  updateQuestionInBank,
  deleteQuestionFromBank,
} from '../controllers/questionBankController.js';
import { protect, lecturer } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/').post(protect, lecturer, addQuestionToBank);
router
  .route('/:id')
  .put(protect, lecturer, updateQuestionInBank)
  .delete(protect, lecturer, deleteQuestionFromBank);

export default router;
