import express from 'express';
import {
  getAIExplanation,
  getAIPerformanceInsights,
  generateQuestionWithAI,
  generateBulkQuestionsWithAI,
  gradeTextAnswerWithAI,
} from '../controllers/aiController.js';
import { protect, lecturer } from '../middleware/authMiddleware.js';

const router = express.Router();

// All AI routes are protected
router.use(protect);

router.post('/explanation', getAIExplanation);
router.post('/performance-insights', getAIPerformanceInsights);
router.post('/grade-answer', gradeTextAnswerWithAI);

// Generation routes should be for lecturers/admins only
router.post('/generate-question', lecturer, generateQuestionWithAI);
router.post('/generate-bulk-questions', lecturer, generateBulkQuestionsWithAI);


export default router;
