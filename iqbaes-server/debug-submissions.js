import 'dotenv/config';
import mongoose from 'mongoose';
import User from './models/User.js';
import Course from './models/Course.js';
import Exam from './models/Exam.js';
import Submission from './models/Submission.js';

async function debugSubmissions() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    const now = new Date();
    console.log('Current time:', now);
    
    // Check all exams and their dates
    const allExams = await Exam.find({}).populate('courseId', 'name');
    console.log('\n=== ALL EXAMS ===');
    allExams.forEach(exam => {
      console.log(`${exam.title}:`);
      console.log(`  Available from: ${exam.availableFrom}`);
      console.log(`  Available until: ${exam.availableUntil}`);
      console.log(`  Is past exam: ${exam.availableUntil < now}`);
      console.log(`  Course: ${exam.courseId.name}`);
      console.log('');
    });
    
    // Check past exams specifically
    const pastExams = allExams.filter(exam => exam.availableUntil < now);
    console.log(`\n=== PAST EXAMS (${pastExams.length}) ===`);
    pastExams.forEach(exam => {
      console.log(`- ${exam.title} (ended: ${exam.availableUntil})`);
    });
    
    // Check students and their enrollments
    const students = await User.find({ role: 'student' });
    console.log(`\n=== STUDENTS (${students.length}) ===`);
    
    let studentsWithEnrollments = 0;
    students.forEach(student => {
      if (student.enrolledCourseIds && student.enrolledCourseIds.length > 0) {
        studentsWithEnrollments++;
      }
    });
    
    console.log(`Students with enrollments: ${studentsWithEnrollments}`);
    
    // Check existing submissions
    const submissions = await Submission.find({});
    console.log(`\nExisting submissions: ${submissions.length}`);
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

debugSubmissions();