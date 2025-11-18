import mongoose from 'mongoose';
import Submission from './models/Submission.js';

try {
  await mongoose.connect('mongodb://localhost:27017/iqbaes');
  console.log('Connected to MongoDB');
  
  const examId = '68ad73975b875d50d3d5a01e';
  const submissions = await Submission.find({examId: examId});
  
  console.log(`\n=== Submissions for exam ${examId} ===`);
  console.log(`Total submissions: ${submissions.length}`);
  
  if (submissions.length > 0) {
    submissions.forEach((sub, index) => {
      console.log(`${index + 1}. User: ${sub.userId}, Submitted: ${sub.submittedAt}`);
    });
  }
  
  await mongoose.disconnect();
  console.log('\nDisconnected from MongoDB');
} catch (error) {
  console.error('Error:', error);
  process.exit(1);
}