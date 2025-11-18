import mongoose from 'mongoose';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

class DatabaseCleanup {
  constructor() {
    this.stats = {
      collectionsDropped: 0,
      documentsRemoved: 0,
      errors: []
    };
  }

  async connect() {
    try {
      const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
      if (!mongoUri) {
        throw new Error('MongoDB URI not found in environment variables');
      }
      await mongoose.connect(mongoUri);
      console.log('✅ Connected to MongoDB');
    } catch (error) {
      console.error('❌ MongoDB connection error:', error);
      process.exit(1);
    }
  }

  async analyzeDatabase() {
    try {
      console.log('\n🔍 Analyzing database...');
      
      const collections = await mongoose.connection.db.listCollections().toArray();
      
      console.log('\n📋 Current collections:');
      
      const analysis = {
        empty: [],
        backup: [],
        active: [],
        unknown: []
      };
      
      for (const collection of collections) {
        const count = await mongoose.connection.db.collection(collection.name).countDocuments();
        
        if (count === 0) {
          analysis.empty.push(collection.name);
          console.log(`   📭 ${collection.name}: ${count} documents (EMPTY)`);
        } else if (collection.name.includes('backup') || collection.name.includes('_backup_')) {
          analysis.backup.push(collection.name);
          console.log(`   💾 ${collection.name}: ${count} documents (BACKUP)`);
        } else if (['users', 'usersecurities', 'userenrollments', 'courses', 'exams', 'submissions', 'feedbacks', 'bankquestions', 'securitylogs', 'authenticationlogs', 'auditlogs', 'systemlogs', 'alertresolutions'].includes(collection.name)) {
          analysis.active.push(collection.name);
          console.log(`   ✅ ${collection.name}: ${count} documents (ACTIVE)`);
        } else {
          analysis.unknown.push(collection.name);
          console.log(`   ❓ ${collection.name}: ${count} documents (UNKNOWN)`);
        }
      }
      
      return analysis;
    } catch (error) {
      console.error('❌ Error analyzing database:', error);
      throw error;
    }
  }

  async dropCollection(collectionName) {
    try {
      const count = await mongoose.connection.db.collection(collectionName).countDocuments();
      await mongoose.connection.db.collection(collectionName).drop();
      console.log(`   ✅ Dropped ${collectionName} (${count} documents)`);
      this.stats.collectionsDropped++;
      this.stats.documentsRemoved += count;
    } catch (error) {
      if (error.code === 26) {
        console.log(`   ⚠️  ${collectionName} doesn't exist (skipped)`);
      } else {
        console.error(`   ❌ Error dropping ${collectionName}:`, error.message);
        this.stats.errors.push(`${collectionName}: ${error.message}`);
      }
    }
  }

  async cleanupEmptyCollections(emptyCollections) {
    if (emptyCollections.length === 0) {
      console.log('\n✅ No empty collections to clean up');
      return;
    }
    
    console.log('\n🧹 Cleaning up empty collections...');
    for (const collection of emptyCollections) {
      await this.dropCollection(collection);
    }
  }

  async cleanupBackupCollections(backupCollections) {
    if (backupCollections.length === 0) {
      console.log('\n✅ No backup collections found');
      return;
    }
    
    console.log('\n💾 Found backup collections:');
    backupCollections.forEach((col, index) => {
      console.log(`${index + 1}. ${col}`);
    });
    
    const keepBackups = await askQuestion('\nDo you want to keep backup collections? (yes/no): ');
    
    if (keepBackups.toLowerCase() === 'no') {
      console.log('\n🗑️  Removing backup collections...');
      for (const collection of backupCollections) {
        await this.dropCollection(collection);
      }
    } else {
      console.log('\n✅ Keeping backup collections');
    }
  }

  async cleanupUnknownCollections(unknownCollections) {
    if (unknownCollections.length === 0) {
      console.log('\n✅ No unknown collections found');
      return;
    }
    
    console.log('\n❓ Found unknown collections:');
    unknownCollections.forEach((col, index) => {
      console.log(`${index + 1}. ${col}`);
    });
    
    const removeUnknown = await askQuestion('\nDo you want to remove unknown collections? (yes/no): ');
    
    if (removeUnknown.toLowerCase() === 'yes') {
      console.log('\n🗑️  Removing unknown collections...');
      for (const collection of unknownCollections) {
        await this.dropCollection(collection);
      }
    } else {
      console.log('\n✅ Keeping unknown collections');
    }
  }

  async printStats() {
    console.log('\n📊 Cleanup Statistics:');
    console.log('======================');
    console.log(`Collections dropped: ${this.stats.collectionsDropped}`);
    console.log(`Documents removed: ${this.stats.documentsRemoved}`);
    
    if (this.stats.errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      this.stats.errors.forEach(error => console.log(`   - ${error}`));
    }
  }

  async run() {
    try {
      console.log('🧹 Database Cleanup Tool');
      console.log('========================\n');
      
      console.log('⚠️  WARNING: This will permanently delete collections from your database!');
      console.log('Make sure you have a backup before proceeding.\n');
      
      const confirm = await askQuestion('Are you sure you want to continue? (yes/no): ');
      if (confirm.toLowerCase() !== 'yes') {
        console.log('\n❌ Cleanup cancelled.');
        return;
      }
      
      await this.connect();
      
      const analysis = await this.analyzeDatabase();
      
      // Always clean empty collections
      await this.cleanupEmptyCollections(analysis.empty);
      
      // Ask about backup collections
      await this.cleanupBackupCollections(analysis.backup);
      
      // Ask about unknown collections
      await this.cleanupUnknownCollections(analysis.unknown);
      
      await this.printStats();
      
      console.log('\n✅ Database cleanup completed!');
      console.log('\n📝 Active collections remaining:');
      analysis.active.forEach(col => console.log(`   - ${col}`));
      
    } catch (error) {
      console.error('\n❌ Cleanup failed:', error);
      process.exit(1);
    } finally {
      rl.close();
      await mongoose.disconnect();
      console.log('\n🔌 Disconnected from MongoDB');
    }
  }
}

// Run cleanup if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const cleanup = new DatabaseCleanup();
  cleanup.run();
}

export default DatabaseCleanup;