import mongoose from 'mongoose';
import Submission from './models/Submission.js';

mongoose.connect('mongodb://localhost:27017/iqbaes').then(async () => {
  console.log('Connected to MongoDB');
  
  const submissions = await Submission.find().limit(5).populate('results.question');
  console.log('Sample submissions:');
  
  submissions.forEach((sub, i) => {
    console.log(`Submission ${i+1}:`);
    sub.results.forEach((result, j) => {
      const questionText = (result.question.question || result.question.text || '').substring(0, 50);
      console.log(`  Question ${j+1}: type='${result.question.type}', text='${questionText}...'`);
    });
  });
  
  mongoose.disconnect();
}).catch(console.error);