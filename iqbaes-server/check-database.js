import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function checkDatabase() {
  try {
    console.log('🔍 Checking database contents...');
    
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    const db = mongoose.connection.db;
    
    // Get all collections
    const collections = await db.listCollections().toArray();
    console.log('\n📋 Available collections:');
    
    if (collections.length === 0) {
      console.log('   No collections found - database is empty');
      console.log('\n✅ Safe to run migration without backup');
      return;
    }
    
    let totalDocuments = 0;
    
    for (const collection of collections) {
      const count = await db.collection(collection.name).countDocuments();
      console.log(`   - ${collection.name}: ${count} documents`);
      totalDocuments += count;
    }
    
    console.log(`\n📊 Total documents: ${totalDocuments}`);
    
    if (totalDocuments === 0) {
      console.log('\n✅ All collections are empty - safe to run migration without backup');
    } else {
      console.log('\n⚠️  Database contains data - backup recommended before migration');
      console.log('\nOptions:');
      console.log('1. Install MongoDB tools and create backup');
      console.log('2. Export data manually from MongoDB Compass');
      console.log('3. Proceed without backup (risky for production data)');
    }
    
  } catch (error) {
    console.error('❌ Error checking database:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

checkDatabase();