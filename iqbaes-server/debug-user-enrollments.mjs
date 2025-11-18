import mongoose from 'mongoose';
import User from './models/User.js';
import UserEnrollments from './models/UserEnrollments.js';
import Course from './models/Course.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const debugUserEnrollments = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Find the lecturer user
    const lecturer = await User.findOne({ username: 'lecturer1@university.edu' });
    if (!lecturer) {
      console.log('❌ Lecturer not found');
      return;
    }

    console.log('\n=== LECTURER USER INFO ===');
    console.log('Name:', lecturer.name);
    console.log('Username:', lecturer.username);
    console.log('Role:', lecturer.role);
    console.log('User ID:', lecturer._id.toString());

    // Check UserEnrollments for this lecturer
    console.log('\n=== USER ENROLLMENTS CHECK ===');
    const userEnrollments = await UserEnrollments.find({ userId: lecturer._id });
    console.log('UserEnrollments found:', userEnrollments.length);
    
    if (userEnrollments.length === 0) {
      console.log('❌ NO USER ENROLLMENTS FOUND FOR THIS LECTURER!');
      console.log('This explains why enrolledCourseIds is empty.');
      
      // Check if there are any UserEnrollments at all
      const allEnrollments = await UserEnrollments.find({});
      console.log('\nTotal UserEnrollments in database:', allEnrollments.length);
      
      if (allEnrollments.length > 0) {
        console.log('\nExisting enrollments:');
        for (const enrollment of allEnrollments) {
          const user = await User.findById(enrollment.userId);
          const course = await Course.findById(enrollment.courseId);
          console.log(`- User: ${user?.name || 'Unknown'} (${user?.username || 'Unknown'})`);
          console.log(`  Course: ${course?.name || 'Unknown'} (${course?.code || 'Unknown'})`);
          console.log(`  UserID: ${enrollment.userId}`);
          console.log(`  CourseID: ${enrollment.courseId}`);
        }
      }
    } else {
      console.log('✅ UserEnrollments found:');
      for (const enrollment of userEnrollments) {
        const course = await Course.findById(enrollment.courseId);
        console.log(`- Course: ${course?.name || 'Unknown'} (${course?.code || 'Unknown'})`);
        console.log(`  CourseID: ${enrollment.courseId}`);
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
};

debugUserEnrollments();