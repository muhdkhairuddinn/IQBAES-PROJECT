import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

class DatabaseBackup {
  constructor() {
    this.backupDir = './backup';
    this.timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.backupPath = path.join(this.backupDir, `backup-${this.timestamp}`);
  }

  async connect() {
    try {
      await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
      console.log('✅ Connected to MongoDB');
    } catch (error) {
      console.error('❌ MongoDB connection error:', error);
      process.exit(1);
    }
  }

  async createBackupDirectory() {
    try {
      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true });
      }
      if (!fs.existsSync(this.backupPath)) {
        fs.mkdirSync(this.backupPath, { recursive: true });
      }
      console.log(`📁 Created backup directory: ${this.backupPath}`);
    } catch (error) {
      console.error('❌ Error creating backup directory:', error);
      throw error;
    }
  }

  async backupCollection(collectionName) {
    try {
      console.log(`📦 Backing up ${collectionName}...`);
      
      const collection = mongoose.connection.db.collection(collectionName);
      const documents = await collection.find({}).toArray();
      
      const filePath = path.join(this.backupPath, `${collectionName}.json`);
      fs.writeFileSync(filePath, JSON.stringify(documents, null, 2));
      
      console.log(`   ✅ ${collectionName}: ${documents.length} documents backed up`);
      return documents.length;
    } catch (error) {
      console.error(`❌ Error backing up ${collectionName}:`, error.message);
      return 0;
    }
  }

  async run() {
    try {
      console.log('💾 Database Backup Tool');
      console.log('=======================\n');
      
      await this.connect();
      await this.createBackupDirectory();
      
      // Get all collections
      const collections = await mongoose.connection.db.listCollections().toArray();
      
      if (collections.length === 0) {
        console.log('📋 No collections found to backup');
        return;
      }
      
      console.log(`📋 Found ${collections.length} collections to backup\n`);
      
      let totalDocuments = 0;
      
      // Backup each collection
      for (const collection of collections) {
        const count = await this.backupCollection(collection.name);
        totalDocuments += count;
      }
      
      // Create backup info file
      const backupInfo = {
        timestamp: new Date().toISOString(),
        collections: collections.map(c => c.name),
        totalDocuments,
        mongoUri: process.env.MONGO_URI || process.env.MONGODB_URI,
        backupPath: this.backupPath
      };
      
      const infoPath = path.join(this.backupPath, 'backup-info.json');
      fs.writeFileSync(infoPath, JSON.stringify(backupInfo, null, 2));
      
      console.log('\n📊 Backup Summary:');
      console.log('==================');
      console.log(`Total collections: ${collections.length}`);
      console.log(`Total documents: ${totalDocuments}`);
      console.log(`Backup location: ${this.backupPath}`);
      console.log('\n✅ Backup completed successfully!');
      
    } catch (error) {
      console.error('\n❌ Backup failed:', error);
      process.exit(1);
    } finally {
      await mongoose.disconnect();
      console.log('\n🔌 Disconnected from MongoDB');
    }
  }
}

// Run backup if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const backup = new DatabaseBackup();
  backup.run();
}

export default DatabaseBackup;