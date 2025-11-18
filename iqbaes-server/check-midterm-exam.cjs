require('dotenv').config({ path: './iqbaes-server/.env' });
const mongoose = require('mongoose');

// Define schemas
const examSchema = new mongoose.Schema({
  title: String,
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
  questions: [{
    id: String,
    question: String,
    text: String,
    type: String,
    options: [String],
    correctAnswer: mongoose.Schema.Types.Mixed,
    answer: mongoose.Schema.Types.Mixed,
    points: Number,
    difficulty: String,
    topic: String
  }],
  duration: Number,
  availableFrom: Date,
  availableUntil: Date,
  createdAt: Date,
  updatedAt: Date
});

const courseSchema = new mongoose.Schema({
  name: String,
  code: String,
  description: String
});

const Exam = mongoose.model('Exam', examSchema);
const Course = mongoose.model('Course', courseSchema);

async function checkMidtermExam() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Find the midterm exam
    const examId = '689e341d17feae3cc744bc91';
    const exam = await Exam.findById(examId).populate('course');
    
    if (!exam) {
      console.log('❌ Exam not found!');
      return;
    }
    
    console.log('=== MIDTERM EXAM DETAILS ===');
    console.log('Exam ID:', exam._id.toString());
    console.log('Exam Title:', exam.title);
    console.log('Course:', exam.course?.name || 'Unknown');
    console.log('Course Code:', exam.course?.code || 'Unknown');
    console.log('Duration:', exam.duration, 'minutes');
    console.log('Question Count:', exam.questions.length);
    
    console.log('\n=== QUESTIONS ANALYSIS ===');
    exam.questions.forEach((question, index) => {
      console.log(`\n--- Question ${index + 1} ---`);
      console.log('ID:', question.id);
      console.log('"question" field:', question.question);
      console.log('"text" field:', question.text);
      console.log('Type:', question.type);
      console.log('Points:', question.points);
      console.log('Has placeholder in question field:', question.question?.includes('Please update'));
      console.log('Has proper text field:', !!question.text && !question.text.includes('Please update'));
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkMidtermExam();