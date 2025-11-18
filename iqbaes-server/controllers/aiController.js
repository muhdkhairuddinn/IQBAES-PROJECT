import {
  generateExplanation,
  generatePerformanceInsights,
  generateQuestion,
  generateBulkQuestions,
  gradeShortAnswer,
} from '../utils/gemini.js';

// @desc    Get AI explanation for a question
// @route   POST /api/ai/explanation
// @access  Private
const getAIExplanation = async (req, res) => {
  try {
    const { question, userAnswer, isCorrect } = req.body;
    const explanation = await generateExplanation(question, userAnswer, isCorrect);
    res.json({ explanation });
  } catch (error) {
    console.error("Error in getAIExplanation controller:", error);
    res.status(500).json({ message: 'Failed to generate AI explanation', details: error.message });
  }
};

// @desc    Get AI performance insights
// @route   POST /api/ai/performance-insights
// @access  Private
const getAIPerformanceInsights = async (req, res) => {
  try {
    const { results, studentName } = req.body;
    const insights = await generatePerformanceInsights(results, studentName);
    res.json({ insights });
  } catch (error) {
    console.error("Error in getAIPerformanceInsights controller:", error);
    res.status(500).json({ message: 'Failed to generate AI insights', details: error.message });
  }
};

// @desc    Generate a single question with AI
// @route   POST /api/ai/generate-question
// @access  Private/Lecturer
const generateQuestionWithAI = async (req, res) => {
  try {
    const { topic, type, difficulty } = req.body;
    const question = await generateQuestion(topic, type, difficulty);
    res.json({ question });
  } catch (error) {
    console.error("Error in generateQuestionWithAI controller:", error);
    res.status(500).json({ message: 'Failed to generate AI question', details: error.message });
  }
};

// @desc    Generate bulk questions with AI
// @route   POST /api/ai/generate-bulk-questions
// @access  Private/Lecturer
const generateBulkQuestionsWithAI = async (req, res) => {
  try {
    const { topic, count, difficulty, types } = req.body;
    const questions = await generateBulkQuestions(topic, count, difficulty, types);
    res.json({ questions });
  } catch (error) {
    console.error("Error in generateBulkQuestionsWithAI controller:", error);
    res.status(500).json({ message: 'Failed to generate bulk AI questions', details: error.message });
  }
};

// @desc    Grade a short answer with AI
// @route   POST /api/ai/grade-answer
// @access  Private
const gradeTextAnswerWithAI = async (req, res) => {
  try {
    const { question, studentAnswer } = req.body;
    const grade = await gradeShortAnswer(question, studentAnswer);
    res.json({ grade });
  } catch (error) {
    console.error("Error in gradeTextAnswerWithAI controller:", error);
    res.status(500).json({ message: 'Failed to grade with AI', details: error.message });
  }
};


export {
  getAIExplanation,
  getAIPerformanceInsights,
  generateQuestionWithAI,
  generateBulkQuestionsWithAI,
  gradeTextAnswerWithAI,
};