import 'dotenv/config';
import mongoose from 'mongoose';
import BankQuestion from './models/BankQuestion.js';
import connectDB from './config/db.js';

const checkBankQuestions = async () => {
  try {
    await connectDB();
    
    const questions = await BankQuestion.find().limit(10);
    console.log('Bank Questions from database:');
    questions.forEach((q, index) => {
      console.log(`Question ${index + 1}: type='${q.type}', text='${q.question.substring(0, 50)}...'`);
    });
    
    console.log('\nChecking toObject() conversion:');
    const firstQuestion = questions[0];
    if (firstQuestion) {
      const obj = firstQuestion.toObject();
      console.log('Original question type:', firstQuestion.type);
      console.log('toObject() type:', obj.type);
      console.log('toObject() keys:', Object.keys(obj));
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

checkBankQuestions();