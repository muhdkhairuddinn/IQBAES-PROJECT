import mongoose from 'mongoose';
import BankQuestion from './BankQuestion.js';

// Question schema for embedding in exams
export const QuestionSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  question: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['MCQ', 'TF', 'SA', 'Essay'],
    default: 'MCQ'
  },
  options: [{
    type: String,
    required: true
  }],
  correctAnswer: {
    type: Number,
    required: true,
    min: 0
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  },
  category: {
    type: String,
    trim: true
  },
  points: {
    type: Number,
    default: 1,
    min: 0
  },
  explanation: {
    type: String,
    trim: true
  }
});

// Export BankQuestion as named export for compatibility
export { BankQuestion };

// Also export as default for flexibility
export default BankQuestion;