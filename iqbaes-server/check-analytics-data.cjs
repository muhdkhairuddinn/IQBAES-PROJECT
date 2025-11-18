const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define schemas
const UserSchema = new mongoose.Schema({
  name: String,
  username: String,
  role: String
});

const UserEnrollmentsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
  status: String
});

const SubmissionSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  examId: mongoose.Schema.Types.ObjectId,
  submittedAt: Date,
  totalPointsAwarded: Number,
  totalPointsPossible: Number,
  results: Array
});

const User = mongoose.model('User', UserSchema);
const UserEnrollments = mongoose.model('UserEnrollments', UserEnrollmentsSchema);
const Submission = mongoose.model('Submission', SubmissionSchema);

async function checkData() {
  try {
    const lecturers = await User.find({ role: 'lecturer' });
    console.log('Lecturers found:', lecturers.length);
    
    for (let lecturer of lecturers) {
      const enrollments = await UserEnrollments.find({ userId: lecturer._id });
      console.log(`Lecturer ${lecturer.name} (${lecturer.username}) has ${enrollments.length} enrollments`);
    }
    
    const submissions = await Submission.find({});
    console.log('Total submissions:', submissions.length);
    
    if (submissions.length > 0) {
      console.log('Sample submission:', {
        userId: submissions[0].userId,
        examId: submissions[0].examId,
        totalPointsAwarded: submissions[0].totalPointsAwarded,
        totalPointsPossible: submissions[0].totalPointsPossible,
        resultsCount: submissions[0].results?.length || 0
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkData();