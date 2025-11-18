import mongoose from 'mongoose';
import Exam from './models/Exam.js';
import 'dotenv/config';

const verifyMigration = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/iqbaes');
    console.log('Connected to database');
    
    const exams = await Exam.find({});
    console.log(`Checking ${exams.length} exams for validation issues...\n`);
    
    let issuesFound = 0;
    
    for (const exam of exams) {
      const examIssues = [];
      
      exam.questions.forEach((question, index) => {
        // Check difficulty values
        if (question.difficulty && !['easy', 'medium', 'hard'].includes(question.difficulty)) {
          examIssues.push(`Question ${index + 1}: Invalid difficulty '${question.difficulty}'`);
        }
        
        // Check required fields
        if (!question.question) {
          examIssues.push(`Question ${index + 1}: Missing question text`);
        }
        if (question.correctAnswer === undefined || question.correctAnswer === null) {
          examIssues.push(`Question ${index + 1}: Missing correctAnswer`);
        }
        if (!question.options || question.options.length === 0) {
          examIssues.push(`Question ${index + 1}: Missing options`);
        }
      });
      
      if (examIssues.length > 0) {
        console.log(`❌ Exam: ${exam.title}`);
        examIssues.forEach(issue => console.log(`   ${issue}`));
        issuesFound++;
      }
    }
    
    if (issuesFound === 0) {
      console.log('✅ All exams passed validation checks!');
      console.log('\nSample exam data:');
      if (exams.length > 0) {
        const sampleExam = exams[0];
        console.log(`Title: ${sampleExam.title}`);
        if (sampleExam.questions.length > 0) {
          const sampleQuestion = sampleExam.questions[0];
          console.log(`First question difficulty: '${sampleQuestion.difficulty}'`);
          console.log(`First question has text: ${!!sampleQuestion.question}`);
          console.log(`First question correctAnswer: ${sampleQuestion.correctAnswer}`);
        }
      }
    } else {
      console.log(`\n❌ Found issues in ${issuesFound} exams`);
    }
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
};

verifyMigration();