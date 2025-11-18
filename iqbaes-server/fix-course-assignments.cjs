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

async function fixCourseAssignments() {
  try {
    console.log('=== FIXING COURSE ASSIGNMENTS ===\n');
    
    // Get all courses
    const courses = await Course.find();
    console.log(`Total courses available: ${courses.length}`);
    courses.forEach(course => {
      console.log(`- ${course.code}: ${course.name}`);
    });
    
    // Fix Admin assignments - assign all courses
    console.log('\n--- FIXING ADMIN COURSE ASSIGNMENTS ---');
    const admins = await User.find({ role: 'admin' });
    
    for (const admin of admins) {
      console.log(`Assigning all courses to admin: ${admin.name}`);
      
      // Update enrolledCourseIds field
      admin.enrolledCourseIds = courses.map(c => c._id);
      await admin.save();
      
      // Create UserEnrollments records
      for (const course of courses) {
        const existingEnrollment = await UserEnrollments.findOne({
          userId: admin._id,
          courseId: course._id
        });
        
        if (!existingEnrollment) {
          await UserEnrollments.create({
            userId: admin._id,
            courseId: course._id,
            status: 'active',
            enrolledAt: new Date()
          });
          console.log(`  - Enrolled in ${course.code}: ${course.name}`);
        }
      }
    }
    
    // Fix Lecturer assignments - assign 3 courses each
    console.log('\n--- FIXING LECTURER COURSE ASSIGNMENTS ---');
    const lecturers = await User.find({ role: 'lecturer' });
    
    for (let i = 0; i < lecturers.length; i++) {
      const lecturer = lecturers[i];
      console.log(`\nAssigning courses to lecturer: ${lecturer.name}`);
      
      // Assign 3 courses per lecturer, cycling through available courses
      const startIndex = (i % 3);
      const assignedCourses = courses.slice(startIndex, startIndex + 3);
      
      // If we don't have enough courses from the slice, add from the beginning
      if (assignedCourses.length < 3) {
        const remaining = 3 - assignedCourses.length;
        assignedCourses.push(...courses.slice(0, remaining));
      }
      
      // Update enrolledCourseIds field
      lecturer.enrolledCourseIds = assignedCourses.map(c => c._id);
      await lecturer.save();
      
      // Create UserEnrollments records
      for (const course of assignedCourses) {
        const existingEnrollment = await UserEnrollments.findOne({
          userId: lecturer._id,
          courseId: course._id
        });
        
        if (!existingEnrollment) {
          await UserEnrollments.create({
            userId: lecturer._id,
            courseId: course._id,
            status: 'active',
            enrolledAt: new Date()
          });
          console.log(`  - Enrolled in ${course.code}: ${course.name}`);
        }
      }
    }
    
    // Verify the assignments
    console.log('\n=== VERIFICATION ===');
    
    const updatedAdmins = await User.find({ role: 'admin' }).populate('enrolledCourseIds');
    console.log('\nAdmin course assignments:');
    updatedAdmins.forEach(admin => {
      console.log(`${admin.name}: ${admin.enrolledCourseIds.length} courses`);
    });
    
    const updatedLecturers = await User.find({ role: 'lecturer' }).populate('enrolledCourseIds');
    console.log('\nLecturer course assignments:');
    updatedLecturers.forEach(lecturer => {
      console.log(`${lecturer.name}: ${lecturer.enrolledCourseIds.length} courses`);
      lecturer.enrolledCourseIds.forEach(course => {
        console.log(`  - ${course.code}: ${course.name}`);
      });
    });
    
    console.log('\n✅ Course assignments fixed successfully!');
    
  } catch (error) {
    console.error('Error fixing course assignments:', error);
  } finally {
    mongoose.disconnect();
  }
}

fixCourseAssignments();