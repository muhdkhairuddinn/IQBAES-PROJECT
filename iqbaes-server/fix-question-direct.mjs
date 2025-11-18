import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

try {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');
  
  // Target the specific exam that has the issue
  const examId = '689e341d17feae3cc744bc90';
  
  // Use direct MongoDB operations to bypass Mongoose validation
  const db = mongoose.connection.db;
  const collection = db.collection('exams');
  
  // Find the exam
  const exam = await collection.findOne({ _id: new mongoose.Types.ObjectId(examId) });
  
  if (!exam) {
    console.log('Exam not found');
    process.exit(1);
  }
  
  console.log(`Found exam: ${exam.title}`);
  console.log(`Questions count: ${exam.questions.length}`);
  
  let updated = false;
  const changes = [];
  
  for (let i = 0; i < exam.questions.length; i++) {
    const question = exam.questions[i];
    console.log(`\nQuestion ${i + 1}:`);
    console.log(`- text: "${question.text}"`);
    console.log(`- question: "${question.question}"`);
    
    // If question has both 'text' and 'question' fields, use 'text' as the correct question
    if (question.text && question.question && question.text !== question.question) {
      console.log(`✅ Replacing question field with text field`);
      question.question = question.text;
      delete question.text;
      changes.push(`Question ${i + 1}: Replaced placeholder with proper question`);
      updated = true;
    }
    // If question field is missing but text exists, use text
    else if (!question.question && question.text) {
      console.log(`✅ Setting question field from text field`);
      question.question = question.text;
      delete question.text;
      changes.push(`Question ${i + 1}: Set question from text field`);
      updated = true;
    }
    // If question has placeholder text
    else if (question.question && (question.question.includes('Please update') || question.question.includes('bodoh'))) {
      console.log(`⚠️ Found placeholder text: "${question.question}"`);
      changes.push(`Question ${i + 1}: Contains placeholder text`);
    }
  }
  
  if (updated) {
    // Use MongoDB's updateOne to bypass Mongoose validation
    const result = await collection.updateOne(
      { _id: new mongoose.Types.ObjectId(examId) },
      { $set: { questions: exam.questions } }
    );
    
    if (result.modifiedCount > 0) {
      console.log('\n✅ Successfully updated exam!');
      console.log('Changes made:');
      changes.forEach(change => console.log(`- ${change}`));
    } else {
      console.log('\n❌ No documents were modified');
    }
  } else {
    console.log('\n✅ No updates needed');
  }
  
  await mongoose.disconnect();
  process.exit(0);
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
}