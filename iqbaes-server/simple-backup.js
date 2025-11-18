import mongoose from 'mongoose';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

async function simpleBackup() {
  try {
    console.log('💾 Creating simple backup...');
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');
    
    const db = mongoose.connection.db;
    
    // Create backup directory
    if (!fs.existsSync('./backup')) {
      fs.mkdirSync('./backup');
    }
    
    // Backup users collection
    const users = await db.collection('users').find({}).toArray();
    fs.writeFileSync('./backup/users.json', JSON.stringify(users, null, 2));
    console.log(`✅ Backed up ${users.length} users`);
    
    // Backup logs collection
    const logs = await db.collection('logs').find({}).toArray();
    fs.writeFileSync('./backup/logs.json', JSON.stringify(logs, null, 2));
    console.log(`✅ Backed up ${logs.length} logs`);
    
    console.log('\n✅ Backup completed!');
    
  } catch (error) {
    console.error('❌ Backup error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

simpleBackup();