import 'dotenv/config';
import mongoose from 'mongoose';
import BankQuestion from './models/BankQuestion.js';
import Exam from './models/Exam.js';
import connectDB from './config/db.js';

const checkEssayQuestions = async () => {
  try {
    await connectDB();
    
    // Check for Essay questions in BankQuestion collection
    const essayQuestions = await BankQuestion.find({ type: 'Essay' });
    console.log(`Found ${essayQuestions.length} Essay questions in BankQuestion collection:`);
    essayQuestions.forEach((q, index) => {
      console.log(`Essay ${index + 1}: type='${q.type}', text='${q.question.substring(0, 80)}...'`);
    });
    
    // Check for Essay questions in Exam collection
    const exams = await Exam.find();
    console.log(`\nChecking ${exams.length} exams for Essay questions:`);
    
    let totalEssayQuestionsInExams = 0;
    exams.forEach((exam, examIndex) => {
      const essayQuestionsInExam = exam.questions.filter(q => q.type === 'Essay');
      if (essayQuestionsInExam.length > 0) {
        console.log(`Exam ${examIndex + 1} (${exam.title}): ${essayQuestionsInExam.length} Essay questions`);
        essayQuestionsInExam.forEach((q, qIndex) => {
          console.log(`  Essay ${qIndex + 1}: type='${q.type}', text='${q.question.substring(0, 60)}...'`);
        });
        totalEssayQuestionsInExams += essayQuestionsInExam.length;
      }
    });
    
    console.log(`\nTotal Essay questions found in exams: ${totalEssayQuestionsInExams}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

checkEssayQuestions();