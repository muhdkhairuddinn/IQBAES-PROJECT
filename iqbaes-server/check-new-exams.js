import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Exam from './models/Exam.js';

dotenv.config();

async function checkNewExams() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const exams = await Exam.find({});
    console.log(`\nFound ${exams.length} exams:`);
    
    exams.forEach((exam, index) => {
      console.log(`\n--- Exam ${index + 1} ---`);
      console.log(`Title: ${exam.title}`);
      console.log(`Course ID: ${exam.courseId}`);
      console.log(`Duration: ${exam.durationMinutes} minutes`);
      console.log(`Question Count: ${exam.questionCount}`);
      console.log(`Available From: ${exam.availableFrom}`);
      console.log(`Available Until: ${exam.availableUntil}`);
      
      if (exam.questions && exam.questions.length > 0) {
        console.log('\nFirst 3 questions:');
        exam.questions.slice(0, 3).forEach((q, qIndex) => {
          console.log(`  Q${qIndex + 1}: ${q.text || q.question || 'No text'}`);
          console.log(`  Type: ${q.type}`);
          if (q.options && q.options.length > 0) {
            console.log(`  Options: ${q.options.join(', ')}`);
          }
          console.log(`  Answer: ${q.answer}`);
          console.log('');
        });
      }
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkNewExams();