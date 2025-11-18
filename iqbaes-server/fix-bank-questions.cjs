// Simple Node.js script to fix bank questions
const mongoose = require('mongoose');
require('dotenv').config();

// Define the BankQuestion schema
const bankQuestionSchema = new mongoose.Schema({
  question: String,
  options: [String],
  correctAnswer: String,
  category: String,
  difficulty: String,
  points: Number,
  type: String
});

const BankQuestion = mongoose.model('BankQuestion', bankQuestionSchema);

async function fixBankQuestions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/iqbaes');
    console.log('Connected to MongoDB');
    
    // Check current state
    const sampleQuestions = await BankQuestion.find({}).limit(3);
    console.log('\nSample questions before update:');
    sampleQuestions.forEach((q, i) => {
      console.log(`Question ${i + 1}:`);
      console.log(`  Type: ${q.type || 'MISSING'}`);
      console.log(`  Question: ${q.question?.substring(0, 50)}...`);
      console.log(`  Options: ${q.options?.length || 0} items`);
      console.log('---');
    });
    
    // Update questions without type field
    const updateResult = await BankQuestion.updateMany(
      { type: { $exists: false } },
      { $set: { type: 'MCQ' } }
    );
    
    console.log(`\nUpdated ${updateResult.modifiedCount} questions with missing type field`);
    
    // Update questions with null/empty type or wrong string value
    const updateResult2 = await BankQuestion.updateMany(
      { $or: [{ type: null }, { type: '' }, { type: 'Multiple Choice' }] },
      { $set: { type: 'MCQ' } }
    );
    
    console.log(`Updated ${updateResult2.modifiedCount} questions with null/empty type`);
    
    // Check final state
    const finalSample = await BankQuestion.find({}).limit(3);
    console.log('\nSample questions after update:');
    finalSample.forEach((q, i) => {
      console.log(`Question ${i + 1}:`);
      console.log(`  Type: ${q.type}`);
      console.log(`  Question: ${q.question?.substring(0, 50)}...`);
      console.log(`  Options: ${q.options?.length || 0} items`);
      console.log('---');
    });
    
    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

fixBankQuestions();