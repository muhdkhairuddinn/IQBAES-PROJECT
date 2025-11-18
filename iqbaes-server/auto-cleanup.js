import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

class AutoDatabaseCleanup {
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
        unknown: [],
        old: []
      };
      
      // Define active collections that should be kept
      const activeCollections = [
        'users', 'usersecurities', 'userenrollments', 'courses', 'exams', 
        'submissions', 'feedbacks', 'bankquestions', 'securitylogs', 
        'authenticationlogs', 'auditlogs', 'systemlogs', 'alertresolutions'
      ];
      
      // Define old collections that can be removed after migration
      const oldCollections = ['logs'];
      
      for (const collection of collections) {
        const count = await mongoose.connection.db.collection(collection.name).countDocuments();
        
        if (count === 0) {
          analysis.empty.push(collection.name);
          console.log(`   📭 ${collection.name}: ${count} documents (EMPTY - will be removed)`);
        } else if (collection.name.includes('backup') || collection.name.includes('_backup_')) {
          analysis.backup.push(collection.name);
          console.log(`   💾 ${collection.name}: ${count} documents (BACKUP - will be kept)`);
        } else if (activeCollections.includes(collection.name)) {
          analysis.active.push(collection.name);
          console.log(`   ✅ ${collection.name}: ${count} documents (ACTIVE - will be kept)`);
        } else if (oldCollections.includes(collection.name)) {
          analysis.old.push(collection.name);
          console.log(`   🗑️  ${collection.name}: ${count} documents (OLD - will be removed after backup)`);
        } else {
          analysis.unknown.push(collection.name);
          console.log(`   ❓ ${collection.name}: ${count} documents (UNKNOWN - will be removed)`);
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

  async backupCollection(collectionName) {
    try {
      const collection = mongoose.connection.db.collection(collectionName);
      const documents = await collection.find({}).toArray();
      
      if (documents.length > 0) {
        const backupName = `${collectionName}_backup_${new Date().toISOString().replace(/[:.]/g, '-')}`;
        await mongoose.connection.db.collection(backupName).insertMany(documents);
        console.log(`   💾 Backed up ${collectionName} to ${backupName} (${documents.length} documents)`);
        return backupName;
      }
      return null;
    } catch (error) {
      console.error(`   ❌ Error backing up ${collectionName}:`, error.message);
      this.stats.errors.push(`Backup ${collectionName}: ${error.message}`);
      return null;
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

  async cleanupOldCollections(oldCollections) {
    if (oldCollections.length === 0) {
      console.log('\n✅ No old collections to clean up');
      return;
    }
    
    console.log('\n🗑️  Cleaning up old collections (with backup)...');
    for (const collection of oldCollections) {
      const backupName = await this.backupCollection(collection);
      if (backupName) {
        await this.dropCollection(collection);
      }
    }
  }

  async cleanupUnknownCollections(unknownCollections) {
    if (unknownCollections.length === 0) {
      console.log('\n✅ No unknown collections found');
      return;
    }
    
    console.log('\n❓ Cleaning up unknown collections...');
    for (const collection of unknownCollections) {
      await this.dropCollection(collection);
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
      console.log('🧹 Auto Database Cleanup Tool');
      console.log('=============================\n');
      
      console.log('🚀 Starting automatic cleanup...');
      
      await this.connect();
      
      const analysis = await this.analyzeDatabase();
      
      // Clean empty collections
      await this.cleanupEmptyCollections(analysis.empty);
      
      // Clean old collections (with backup)
      await this.cleanupOldCollections(analysis.old);
      
      // Clean unknown collections
      await this.cleanupUnknownCollections(analysis.unknown);
      
      await this.printStats();
      
      console.log('\n✅ Database cleanup completed!');
      console.log('\n📝 Active collections remaining:');
      analysis.active.forEach(col => console.log(`   - ${col}`));
      
      if (analysis.backup.length > 0) {
        console.log('\n💾 Backup collections kept:');
        analysis.backup.forEach(col => console.log(`   - ${col}`));
      }
      
    } catch (error) {
      console.error('\n❌ Cleanup failed:', error);
      process.exit(1);
    } finally {
      await mongoose.disconnect();
      console.log('\n🔌 Disconnected from MongoDB');
    }
  }
}

// Run cleanup if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const cleanup = new AutoDatabaseCleanup();
  cleanup.run();
}

export default AutoDatabaseCleanup;