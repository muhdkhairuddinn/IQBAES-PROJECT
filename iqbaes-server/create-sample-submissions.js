import mongoose from 'mongoose';
import connectDB from './config/db.js';
import User from './models/User.js';
import Exam from './models/Exam.js';
import Submission from './models/Submission.js';
import UserEnrollments from './models/UserEnrollments.js';

const createSampleSubmissions = async () => {
  try {
    await connectDB();
    
    console.log('Checking existing data...');
    
    // Get all students
    const students = await User.find({ role: 'student' });
    console.log(`Found ${students.length} students`);
    
    // Get all exams
    const exams = await Exam.find({});
    console.log(`Found ${exams.length} exams`);
    
    // Get all enrollments
    const enrollments = await UserEnrollments.find({});
    console.log(`Found ${enrollments.length} enrollments`);
    
    // Check existing submissions
    const existingSubmissions = await Submission.find({});
    console.log(`Found ${existingSubmissions.length} existing submissions`);
    
    // Get past exams (where availableUntil is in the past)
    const now = new Date();
    const pastExams = exams.filter(exam => exam.availableUntil && exam.availableUntil < now);
    console.log(`Found ${pastExams.length} past exams`);
    
    if (pastExams.length === 0) {
      console.log('No past exams found. Creating some past exams...');
      
      // Update some exams to be in the past
      const examsToUpdate = exams.slice(0, Math.min(8, exams.length)); // Update first 8 exams
      
      for (let i = 0; i < examsToUpdate.length; i++) {
        const exam = examsToUpdate[i];
        const daysAgo = 7 + i; // 7-14 days ago
        
        exam.availableFrom = new Date(now.getTime() - (daysAgo + 2) * 24 * 60 * 60 * 1000);
        exam.availableUntil = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
        
        await exam.save();
        console.log(`Updated exam "${exam.title}" to be in the past`);
      }
      
      // Refresh past exams list
      const updatedPastExams = await Exam.find({ availableUntil: { $lt: now } });
      console.log(`Now have ${updatedPastExams.length} past exams`);
    }
    
    // Create submissions for past exams
    const submissions = [];
    const finalPastExams = await Exam.find({ availableUntil: { $lt: now } });
    
    for (const exam of finalPastExams) {
      // Find students enrolled in this exam's course
      const courseEnrollments = await UserEnrollments.find({ 
        courseId: exam.courseId,
        status: 'active'
      }).populate('userId');
      
      const enrolledStudents = courseEnrollments.map(enrollment => enrollment.userId);
      console.log(`Exam "${exam.title}": ${enrolledStudents.length} enrolled students`);
      
      // 50-80% of students submit
      const submissionRate = 0.5 + Math.random() * 0.3;
      const submittingCount = Math.floor(enrolledStudents.length * submissionRate);
      const submittingStudents = enrolledStudents.slice(0, submittingCount);
      
      console.log(`Creating ${submittingCount} submissions for "${exam.title}"`);
      
      for (const student of submittingStudents) {
        // Check if submission already exists
        const existingSubmission = await Submission.findOne({
          examId: exam._id,
          userId: student._id
        });
        
        if (existingSubmission) {
          console.log(`Submission already exists for student ${student.name}`);
          continue;
        }
        
        // Create realistic answers
        const results = exam.questions.map(question => {
          const isAnswered = Math.random() > 0.1; // 90% answer rate
          let userAnswer = null;
          let isCorrect = false;
          
          if (isAnswered) {
            if (question.type === 'MCQ') {
              // 70% correct rate
              if (Math.random() > 0.3) {
                userAnswer = question.correctAnswer; // Store index, not text
                isCorrect = true;
              } else {
                const wrongIndex = Math.floor(Math.random() * question.options.length);
                userAnswer = wrongIndex; // Store index, not text
                isCorrect = wrongIndex === question.correctAnswer;
              }
            } else if (question.type === 'TF') {
              // 75% correct rate
              if (Math.random() > 0.25) {
                userAnswer = question.correctAnswer; // Store index (0 or 1)
                isCorrect = true;
              } else {
                userAnswer = question.correctAnswer === 0 ? 1 : 0; // Store opposite index
                isCorrect = false;
              }
            } else {
              // For other types, assume 60% correct
              const correctAnswer = question.options ? question.options[question.correctAnswer] : question.correctAnswer;
              if (Math.random() > 0.4) {
                userAnswer = correctAnswer;
                isCorrect = true;
              } else {
                userAnswer = 'incorrect answer';
                isCorrect = false;
              }
            }
          }
          
          return {
            question: question,
            userAnswer: { questionId: question.id, answer: userAnswer },
            isCorrect,
            pointsAwarded: isCorrect ? question.points : 0
          };
        });
        
        const totalPointsAwarded = results.reduce((sum, r) => sum + (r.pointsAwarded || 0), 0);
        const totalPointsPossible = exam.questions.reduce((sum, q) => sum + q.points, 0);
        
        // Random submission time within exam period
        const submissionTime = new Date(
          exam.availableFrom.getTime() + 
          Math.random() * (exam.availableUntil.getTime() - exam.availableFrom.getTime())
        );
        
        const submission = {
          examId: exam._id,
          courseId: exam.courseId,
          userId: student._id,
          results,
          totalPointsAwarded,
          totalPointsPossible,
          submittedAt: submissionTime,
          attemptNumber: 1,
          maxAttempts: 1,
          isRetakeAllowed: false
        };
        
        submissions.push(submission);
      }
    }
    
    if (submissions.length > 0) {
      await Submission.insertMany(submissions);
      console.log(`✅ Created ${submissions.length} sample submissions!`);
    } else {
      console.log('No new submissions to create.');
    }
    
    // Final summary
    const finalSubmissionCount = await Submission.countDocuments();
    console.log(`\n📊 Final Summary:`);
    console.log(`- Total Students: ${students.length}`);
    console.log(`- Total Exams: ${exams.length}`);
    console.log(`- Past Exams: ${finalPastExams.length}`);
    console.log(`- Total Submissions: ${finalSubmissionCount}`);
    console.log(`- Enrollments: ${enrollments.length}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error creating sample submissions:', error);
    process.exit(1);
  }
};

createSampleSubmissions();