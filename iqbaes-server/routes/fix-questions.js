import express from 'express';
import Exam from '../models/Exam.js';
const router = express.Router();

// Fix question field inconsistency
router.post('/fix-question-fields/:examId', async (req, res) => {
  try {
    const { examId } = req.params;
    
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    
    console.log(`Found exam: ${exam.title}`);
    console.log(`Questions count: ${exam.questions.length}`);
    
    let updated = false;
    const changes = [];
    
    for (let i = 0; i < exam.questions.length; i++) {
      const question = exam.questions[i];
      console.log(`Question ${i + 1} before processing:`, {
        hasText: !!question.text,
        hasQuestion: !!question.question,
        text: question.text,
        question: question.question
      });
      
      // If question has both 'text' and 'question' fields, use 'text' as the correct question
      if (question.text && question.question && question.text !== question.question) {
        changes.push({
          questionIndex: i + 1,
          action: 'replaced_question_with_text',
          oldQuestion: question.question,
          newQuestion: question.text
        });
        question.question = question.text;
        // Remove the text field since question is the required field
        delete question.text;
        updated = true;
      }
      // If question field is missing but text exists, use text
      else if (!question.question && question.text) {
        changes.push({
          questionIndex: i + 1,
          action: 'set_question_from_text',
          newQuestion: question.text
        });
        question.question = question.text;
        delete question.text;
        updated = true;
      }
      // If question has placeholder text, check if we can find better content
      else if (question.question && (question.question.includes('Please update') || question.question.includes('bodoh'))) {
        changes.push({
          questionIndex: i + 1,
          action: 'identified_placeholder',
          placeholderText: question.question
        });
        // Keep the question as is for now, but log it
      }
      
      console.log(`Question ${i + 1} after processing:`, {
        hasText: !!question.text,
        hasQuestion: !!question.question,
        text: question.text,
        question: question.question
      });
    }
    
    if (updated) {
      await exam.save();
      res.json({
        success: true,
        message: 'Question fields fixed successfully',
        examTitle: exam.title,
        changes
      });
    } else {
      res.json({
        success: true,
        message: 'No updates needed',
        examTitle: exam.title,
        changes: []
      });
    }
    
  } catch (error) {
    console.error('Error fixing question fields:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

export default router;