// Check and fix student enrollments
const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
};

// Define schemas
const UserSchema = new mongoose.Schema({
  name: String,
  username: String,
  role: String
});

const CourseSchema = new mongoose.Schema({
  code: String,
  name: String
});

const UserEnrollmentsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
  enrolledAt: { type: Date, default: Date.now },
  status: { type: String, default: 'active' }
});

const ExamSchema = new mongoose.Schema({
  title: String,
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
  availableFrom: Date,
  availableUntil: Date,
  questions: Array
});

const User = mongoose.model('User', UserSchema);
const Course = mongoose.model('Course', CourseSchema);
const UserEnrollments = mongoose.model('UserEnrollments', UserEnrollmentsSchema);
const Exam = mongoose.model('Exam', ExamSchema);

const checkAndFixEnrollments = async () => {
  try {
    await connectDB();
    
    // Find our test student
    const student = await User.findOne({ username: 'student1@university.edu' });
    if (!student) {
      console.log('❌ Test student not found');
      return;
    }
    
    console.log('✅ Found test student:', student.name, '(ID:', student._id + ')');
    
    // Check current enrollments
    const enrollments = await UserEnrollments.find({ userId: student._id }).populate('courseId');
    console.log(`📚 Current enrollments: ${enrollments.length}`);
    
    enrollments.forEach(enrollment => {
      console.log(`  - ${enrollment.courseId.name} (${enrollment.courseId.code}) - Status: ${enrollment.status}`);
    });
    
    // Get all courses
    const allCourses = await Course.find({});
    console.log(`\n📖 Available courses: ${allCourses.length}`);
    
    // If student has no enrollments, enroll them in first 3 courses
    if (enrollments.length === 0) {
      console.log('\n🔧 Enrolling student in courses...');
      const coursesToEnroll = allCourses.slice(0, 3);
      
      for (const course of coursesToEnroll) {
        await UserEnrollments.create({
          userId: student._id,
          courseId: course._id,
          status: 'active'
        });
        console.log(`  ✅ Enrolled in: ${course.name}`);
      }
    }
    
    // Check available exams for enrolled courses
    const updatedEnrollments = await UserEnrollments.find({ 
      userId: student._id, 
      status: 'active' 
    });
    const enrolledCourseIds = updatedEnrollments.map(e => e.courseId);
    
    console.log('\n🔍 Checking available exams...');
    const now = new Date();
    const availableExams = await Exam.find({
      courseId: { $in: enrolledCourseIds },
      $and: [
        {
          $or: [
            { availableFrom: { $exists: false } },
            { availableFrom: { $lte: now } }
          ]
        },
        {
          $or: [
            { availableUntil: { $exists: false } },
            { availableUntil: { $gte: now } }
          ]
        }
      ]
    }).populate('courseId');
    
    console.log(`📝 Available exams: ${availableExams.length}`);
    availableExams.forEach(exam => {
      console.log(`  - ${exam.title} (Course: ${exam.courseId.name})`);
      console.log(`    Available: ${exam.availableFrom || 'Always'} to ${exam.availableUntil || 'Always'}`);
      console.log(`    Questions: ${exam.questions ? exam.questions.length : 0}`);
    });
    
    // If no exams are available, let's check all exams and their dates
    if (availableExams.length === 0) {
      console.log('\n⚠️  No exams currently available. Checking all exams...');
      const allExams = await Exam.find({ courseId: { $in: enrolledCourseIds } }).populate('courseId');
      console.log(`Total exams in enrolled courses: ${allExams.length}`);
      
      allExams.forEach(exam => {
        console.log(`  - ${exam.title} (Course: ${exam.courseId.name})`);
        console.log(`    Available: ${exam.availableFrom} to ${exam.availableUntil}`);
        console.log(`    Current time: ${now}`);
        console.log(`    Is available now? ${(!exam.availableFrom || exam.availableFrom <= now) && (!exam.availableUntil || exam.availableUntil >= now)}`);
      });
      
      // Let's make one exam available for testing
      if (allExams.length > 0) {
        const examToUpdate = allExams[0];
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        await Exam.findByIdAndUpdate(examToUpdate._id, {
          availableFrom: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
          availableUntil: tomorrow // Tomorrow
        });
        
        console.log(`\n🔧 Updated exam "${examToUpdate.title}" to be available now`);
      }
    }
    
    console.log('\n✅ Enrollment check complete!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
};

checkAndFixEnrollments();