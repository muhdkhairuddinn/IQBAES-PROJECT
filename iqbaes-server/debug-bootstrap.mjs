import mongoose from 'mongoose';
import User from './models/User.js';
import Course from './models/Course.js';
import UserEnrollments from './models/UserEnrollments.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const debugBootstrap = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Find a lecturer user
    const lecturer = await User.findOne({ role: 'lecturer' });
    if (!lecturer) {
      console.log('No lecturer found');
      return;
    }

    console.log('\n=== DEBUGGING BOOTSTRAP API FOR LECTURER ===');
    console.log('Lecturer:', lecturer.name, '(' + lecturer.username + ')');
    console.log('Lecturer ID:', lecturer._id.toString());

    // Get user's enrolled courses from UserEnrollments
    const userEnrollments = await UserEnrollments.find({ userId: lecturer._id });
    const enrolledCourseIds = userEnrollments.map(enrollment => enrollment.courseId.toString());
    
    console.log('\n--- UserEnrollments Data ---');
    console.log('Enrolled Course IDs (from UserEnrollments):', enrolledCourseIds);
    
    // Get courses that lecturer is enrolled in (what bootstrap API returns)
    const courses = await Course.find({ _id: { $in: enrolledCourseIds } });
    
    console.log('\n--- Bootstrap API Course Data ---');
    console.log('Courses found:', courses.length);
    courses.forEach(course => {
      console.log(`- ${course.code}: ${course.name}`);
      console.log(`  ID: ${course._id.toString()}`);
      console.log(`  JSON ID: ${course.toJSON().id}`);
    });

    // Get all courses for comparison
    const allCourses = await Course.find({});
    console.log('\n--- All Available Courses ---');
    console.log('Total courses in database:', allCourses.length);
    allCourses.forEach(course => {
      console.log(`- ${course.code}: ${course.name}`);
      console.log(`  ID: ${course._id.toString()}`);
      console.log(`  JSON ID: ${course.toJSON().id}`);
    });

    // Simulate what the bootstrap API returns
    console.log('\n--- Simulated Bootstrap Response ---');
    const bootstrapResponse = {
      courses: courses.map(c => c.toJSON()),
      user: {
        ...lecturer.toJSON(),
        enrolledCourseIds
      }
    };
    
    console.log('User enrolledCourseIds:', bootstrapResponse.user.enrolledCourseIds);
    console.log('Courses in response:');
    bootstrapResponse.courses.forEach(course => {
      console.log(`- ${course.code}: ${course.name} (ID: ${course.id})`);
    });

    // Test the filtering logic from App.tsx
    console.log('\n--- Testing App.tsx Filtering Logic ---');
    const userCourses = bootstrapResponse.courses.filter(course => 
      bootstrapResponse.user.enrolledCourseIds.includes(course.id)
    );
    
    console.log('Filtered userCourses:', userCourses.length);
    userCourses.forEach(course => {
      console.log(`- ${course.code}: ${course.name}`);
    });

    if (userCourses.length === 0) {
      console.log('\n❌ ISSUE FOUND: No courses match the filtering logic!');
      console.log('This explains why "No Courses Assigned" appears.');
      
      console.log('\nDebugging the mismatch:');
      console.log('enrolledCourseIds type:', typeof bootstrapResponse.user.enrolledCourseIds[0]);
      console.log('course.id type:', typeof bootstrapResponse.courses[0]?.id);
      
      // Check if there's a type mismatch
      if (bootstrapResponse.courses.length > 0) {
        const courseId = bootstrapResponse.courses[0].id;
        const enrolledId = bootstrapResponse.user.enrolledCourseIds[0];
        console.log('First course ID:', courseId);
        console.log('First enrolled ID:', enrolledId);
        console.log('Are they equal?', courseId === enrolledId);
        console.log('Strict comparison:', courseId === enrolledId);
        console.log('Loose comparison:', courseId == enrolledId);
      }
    } else {
      console.log('\n✅ Filtering logic works correctly!');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
};

debugBootstrap();