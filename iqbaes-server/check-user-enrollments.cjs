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
  role: String,
  enrolledCourseIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }]
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

const User = mongoose.model('User', UserSchema);
const Course = mongoose.model('Course', CourseSchema);
const UserEnrollments = mongoose.model('UserEnrollments', UserEnrollmentsSchema);

async function checkEnrollments() {
  try {
    console.log('=== CHECKING USER ENROLLMENTS ===\n');
    
    // Get all courses
    const courses = await Course.find();
    console.log(`Total courses: ${courses.length}`);
    
    // Check lecturers
    const lecturers = await User.find({ role: 'lecturer' }).populate('enrolledCourseIds');
    console.log(`\nTotal lecturers: ${lecturers.length}`);
    
    console.log('\n--- LECTURER ENROLLMENTS (enrolledCourseIds field) ---');
    lecturers.forEach((lecturer, index) => {
      console.log(`${index + 1}. ${lecturer.name} (${lecturer.username})`);
      console.log(`   enrolledCourseIds: ${lecturer.enrolledCourseIds?.length || 0} courses`);
      if (lecturer.enrolledCourseIds?.length > 0) {
        lecturer.enrolledCourseIds.forEach(course => {
          console.log(`   - ${course.code}: ${course.name}`);
        });
      }
      console.log('');
    });
    
    // Check UserEnrollments collection for lecturers
    console.log('--- LECTURER ENROLLMENTS (UserEnrollments collection) ---');
    for (const lecturer of lecturers) {
      const enrollments = await UserEnrollments.find({ userId: lecturer._id }).populate('courseId');
      console.log(`${lecturer.name}: ${enrollments.length} enrollments in UserEnrollments`);
      enrollments.forEach(enrollment => {
        console.log(`   - ${enrollment.courseId.code}: ${enrollment.courseId.name} (${enrollment.status})`);
      });
      console.log('');
    }
    
    // Check admins
    const admins = await User.find({ role: 'admin' }).populate('enrolledCourseIds');
    console.log(`\nTotal admins: ${admins.length}`);
    
    console.log('\n--- ADMIN ENROLLMENTS (enrolledCourseIds field) ---');
    admins.forEach((admin, index) => {
      console.log(`${index + 1}. ${admin.name} (${admin.username})`);
      console.log(`   enrolledCourseIds: ${admin.enrolledCourseIds?.length || 0} courses`);
      if (admin.enrolledCourseIds?.length > 0) {
        admin.enrolledCourseIds.forEach(course => {
          console.log(`   - ${course.code}: ${course.name}`);
        });
      }
      console.log('');
    });
    
    // Check UserEnrollments collection for admins
    console.log('--- ADMIN ENROLLMENTS (UserEnrollments collection) ---');
    for (const admin of admins) {
      const enrollments = await UserEnrollments.find({ userId: admin._id }).populate('courseId');
      console.log(`${admin.name}: ${enrollments.length} enrollments in UserEnrollments`);
      enrollments.forEach(enrollment => {
        console.log(`   - ${enrollment.courseId.code}: ${enrollment.courseId.name} (${enrollment.status})`);
      });
      console.log('');
    }
    
    console.log('=== ENROLLMENT CHECK COMPLETED ===');
    
  } catch (error) {
    console.error('Error checking enrollments:', error);
  } finally {
    mongoose.disconnect();
  }
}

checkEnrollments();