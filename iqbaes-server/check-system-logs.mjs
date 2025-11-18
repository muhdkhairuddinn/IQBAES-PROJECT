import dotenv from 'dotenv';
import mongoose from 'mongoose';
import SystemLogs from './models/SystemLogs.js';

dotenv.config();

async function checkSystemLogs() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Check recent logs
    const logs = await SystemLogs.find({}).sort({timestamp: -1}).limit(10);
    console.log('\n=== Recent logs ===');
    logs.forEach(log => {
      console.log(`- ${log.type} | ${log.timestamp} | ${log.message || log.details}`);
    });
    
    // Check exam_start logs specifically
    const examStartLogs = await SystemLogs.find({type: 'exam_start'}).sort({timestamp: -1}).limit(5);
    console.log('\n=== Recent exam_start logs ===');
    if (examStartLogs.length === 0) {
      console.log('No exam_start logs found');
    } else {
      examStartLogs.forEach(log => {
        console.log(`- ${log.timestamp} | User: ${log.userName} | Details: ${JSON.stringify(log.details)}`);
      });
    }
    
    // Check all log types
    const logTypes = await SystemLogs.distinct('type');
    console.log('\n=== Available log types ===');
    console.log(logTypes);
    
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkSystemLogs();