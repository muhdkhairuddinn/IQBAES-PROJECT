import dotenv from 'dotenv';
import mongoose from 'mongoose';
import SystemLogs from './models/SystemLogs.js';

dotenv.config();

async function testViolation() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Create a test violation with proper userName
    const violation = await SystemLogs.create({
      type: 'violation',
      level: 'warn',
      message: 'Violation detected: keyboard_shortcut',
      details: {
        examId: 'test-exam-123',
        examTitle: 'Midterm: Introduction to Programming',
        violationType: 'keyboard_shortcut',
        studentId: '68ad73865b875d50d3d59cc6',
        studentName: 'Ahmad Abdullah'
      },
      userId: new mongoose.Types.ObjectId('68ad73865b875d50d3d59cc6'),
      userName: 'Ahmad Abdullah',
      timestamp: new Date()
    });
    
    console.log('✅ Test violation created:', {
      id: violation._id,
      userName: violation.userName,
      message: violation.message,
      details: violation.details
    });
    
    // Query recent violations to verify
    const recentViolations = await SystemLogs.find({
      type: 'violation',
      timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
    }).sort({ timestamp: -1 }).limit(5);
    
    console.log('\n=== Recent violations ===');
    recentViolations.forEach(v => {
      console.log(`- ${v.userName || 'NO_USERNAME'} | ${v.message} | ${v.timestamp}`);
    });
    
    await mongoose.disconnect();
    console.log('\n✅ Test completed successfully');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testViolation();