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

class MigrationRollback {
  constructor() {
    this.stats = {
      collectionsRestored: 0,
      collectionsDropped: 0,
      errors: []
    };
  }

  async connect() {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('✅ Connected to MongoDB');
    } catch (error) {
      console.error('❌ MongoDB connection error:', error);
      process.exit(1);
    }
  }

  async listBackupCollections() {
    try {
      const collections = await mongoose.connection.db.listCollections().toArray();
      const backupCollections = collections.filter(col => 
        col.name.includes('_backup_')
      );
      
      if (backupCollections.length === 0) {
        console.log('❌ No backup collections found!');
        console.log('Cannot perform rollback without backup collections.');
        return [];
      }
      
      console.log('\n📋 Available backup collections:');
      backupCollections.forEach((col, index) => {
        console.log(`${index + 1}. ${col.name}`);
      });
      
      return backupCollections;
    } catch (error) {
      console.error('❌ Error listing collections:', error);
      throw error;
    }
  }

  async rollbackCollection(backupName, originalName) {
    try {
      console.log(`🔄 Rolling back ${originalName}...`);
      
      // Drop the current collection if it exists
      try {
        await mongoose.connection.db.collection(originalName).drop();
        console.log(`   - Dropped current ${originalName}`);
        this.stats.collectionsDropped++;
      } catch (error) {
        if (error.code !== 26) { // Collection doesn't exist
          throw error;
        }
      }
      
      // Rename backup collection to original name
      await mongoose.connection.db.collection(backupName).rename(originalName);
      console.log(`   - Restored ${originalName} from backup`);
      this.stats.collectionsRestored++;
      
    } catch (error) {
      console.error(`❌ Error rolling back ${originalName}:`, error.message);
      this.stats.errors.push(`${originalName}: ${error.message}`);
    }
  }

  async dropNewCollections() {
    console.log('\n🧹 Dropping new collections created by migration...');
    
    const newCollections = [
      'usersecurities',
      'userenrollments', 
      'securitylogs',
      'authenticationlogs',
      'auditlogs',
      'systemlogs',
      'alertresolutions'
    ];
    
    for (const collectionName of newCollections) {
      try {
        await mongoose.connection.db.collection(collectionName).drop();
        console.log(`   - Dropped ${collectionName}`);
        this.stats.collectionsDropped++;
      } catch (error) {
        if (error.code !== 26) { // Collection doesn't exist
          console.log(`   - ${collectionName} doesn't exist (skipped)`);
        }
      }
    }
  }

  async printStats() {
    console.log('\n📊 Rollback Statistics:');
    console.log('========================');
    console.log(`Collections restored: ${this.stats.collectionsRestored}`);
    console.log(`Collections dropped: ${this.stats.collectionsDropped}`);
    
    if (this.stats.errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      this.stats.errors.forEach(error => console.log(`   - ${error}`));
    }
  }

  async run() {
    try {
      console.log('🔄 Database Migration Rollback Tool');
      console.log('====================================\n');
      
      await this.connect();
      
      const backupCollections = await this.listBackupCollections();
      if (backupCollections.length === 0) {
        return;
      }
      
      console.log('\n⚠️  WARNING: This will:');
      console.log('1. Drop all new collections created by the migration');
      console.log('2. Restore original collections from backup');
      console.log('3. Your current migrated data will be lost');
      
      const confirm = await askQuestion('\nAre you sure you want to rollback? (yes/no): ');
      if (confirm.toLowerCase() !== 'yes') {
        console.log('\n❌ Rollback cancelled.');
        return;
      }
      
      // Drop new collections
      await this.dropNewCollections();
      
      // Restore from backups
      console.log('\n🔄 Restoring from backups...');
      for (const backup of backupCollections) {
        const originalName = backup.name.split('_backup_')[0];
        await this.rollbackCollection(backup.name, originalName);
      }
      
      await this.printStats();
      
      console.log('\n✅ Rollback completed!');
      console.log('\n📝 Next steps:');
      console.log('1. Restart your application server');
      console.log('2. Verify that everything is working correctly');
      console.log('3. Consider what went wrong with the migration');
      
    } catch (error) {
      console.error('\n❌ Rollback failed:', error);
      process.exit(1);
    } finally {
      rl.close();
      await mongoose.disconnect();
      console.log('\n🔌 Disconnected from MongoDB');
    }
  }
}

// Run rollback if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const rollback = new MigrationRollback();
  rollback.run();
}

export default MigrationRollback;