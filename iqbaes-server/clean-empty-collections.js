import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function cleanEmptyCollections() {
  try {
    console.log('🧹 Cleaning Empty Collections');
    console.log('============================\n');
    
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MongoDB URI not found in environment variables');
    }
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');
    
    // Get all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    let emptyCollections = [];
    let totalDropped = 0;
    
    console.log('🔍 Analyzing collections...');
    
    // Check each collection for documents
    for (const collection of collections) {
      const count = await mongoose.connection.db.collection(collection.name).countDocuments();
      
      if (count === 0) {
        emptyCollections.push(collection.name);
        console.log(`   📭 ${collection.name}: EMPTY (will be removed)`);
      } else {
        console.log(`   📄 ${collection.name}: ${count} documents (keeping)`);
      }
    }
    
    if (emptyCollections.length === 0) {
      console.log('\n✅ No empty collections found. Database is clean!');
    } else {
      console.log(`\n🗑️  Found ${emptyCollections.length} empty collections to remove:`);
      
      // Drop empty collections
      for (const collectionName of emptyCollections) {
        try {
          await mongoose.connection.db.collection(collectionName).drop();
          console.log(`   ✅ Dropped: ${collectionName}`);
          totalDropped++;
        } catch (error) {
          if (error.code === 26) {
            console.log(`   ⚠️  ${collectionName} already doesn't exist`);
          } else {
            console.log(`   ❌ Error dropping ${collectionName}: ${error.message}`);
          }
        }
      }
      
      console.log(`\n📊 Cleanup Summary:`);
      console.log(`   Collections dropped: ${totalDropped}`);
      console.log(`   Collections remaining: ${collections.length - totalDropped}`);
    }
    
    // Show remaining collections
    console.log('\n📋 Remaining collections:');
    const remainingCollections = await mongoose.connection.db.listCollections().toArray();
    
    for (const collection of remainingCollections) {
      const count = await mongoose.connection.db.collection(collection.name).countDocuments();
      console.log(`   ✅ ${collection.name}: ${count} documents`);
    }
    
    console.log('\n🎉 Database cleanup completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the cleanup
cleanEmptyCollections();