import express from 'express';
import Exam from '../models/Exam.js';

const router = express.Router();

const programmingQuestions = [
  {
    question: "What is the correct syntax to declare a variable in JavaScript?",
    options: [
      "var myVariable;",
      "variable myVariable;",
      "declare myVariable;",
      "let myVariable;"
    ],
    correctAnswer: 0,
    points: 5
  },
  {
    question: "Which of the following is used to create a function in JavaScript?",
    options: [
      "function myFunction() {}",
      "create myFunction() {}",
      "def myFunction() {}",
      "func myFunction() {}"
    ],
    correctAnswer: 0,
    points: 5
  },
  {
    question: "What does the 'console.log()' function do in JavaScript?",
    options: [
      "Creates a new console window",
      "Prints output to the browser console",
      "Logs user activity",
      "Creates a log file"
    ],
    correctAnswer: 1,
    points: 5
  },
  {
    question: "Which operator is used for strict equality comparison in JavaScript?",
    options: [
      "==",
      "===",
      "=",
      "!="
    ],
    correctAnswer: 1,
    points: 5
  },
  {
    question: "What is the correct way to create an array in JavaScript?",
    options: [
      "var arr = [];",
      "var arr = {};",
      "var arr = ();",
      "var arr = <>;"
    ],
    correctAnswer: 0,
    points: 5
  }
];

// Replace all questions in an exam with new programming questions
router.post('/replace-questions/:examId', async (req, res) => {
  try {
    const { examId } = req.params;
    
    console.log(`Replacing questions for exam ID: ${examId}`);
    
    // Find the exam
    const exam = await Exam.findById(examId);
    
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }
    
    console.log(`Found exam: ${exam.title}`);
    console.log(`Current questions count: ${exam.questions.length}`);
    
    // Replace all questions with new programming questions
    exam.questions = programmingQuestions;
    
    // Save the exam
    await exam.save();
    
    console.log(`Successfully replaced all questions with ${programmingQuestions.length} new programming questions`);
    
    res.json({
      success: true,
      message: `Successfully replaced all questions with ${programmingQuestions.length} new programming questions`,
      exam: {
        id: exam._id,
        title: exam.title,
        questionsCount: exam.questions.length
      }
    });
    
  } catch (error) {
    console.error('Error replacing exam questions:', error);
    res.status(500).json({ error: 'Failed to replace exam questions', details: error.message });
  }
});

export default router;