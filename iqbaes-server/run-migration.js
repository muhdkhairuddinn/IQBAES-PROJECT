import DatabaseMigration from './migrate-database.js';
import readline from 'readline';

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

async function main() {
  console.log('🔄 Database Migration Tool');
  console.log('==========================\n');
  
  console.log('⚠️  IMPORTANT WARNINGS:');
  console.log('1. This will modify your existing database structure');
  console.log('2. Make sure you have a backup of your database');
  console.log('3. Stop your application server before running this migration');
  console.log('4. This process may take several minutes depending on data size\n');
  
  const confirm1 = await askQuestion('Have you backed up your database? (yes/no): ');
  if (confirm1.toLowerCase() !== 'yes') {
    console.log('\n❌ Please backup your database first before proceeding.');
    console.log('\nTo backup MongoDB:');
    console.log('mongodump --uri="your_mongodb_connection_string" --out=./backup');
    rl.close();
    return;
  }
  
  const confirm2 = await askQuestion('Have you stopped your application server? (yes/no): ');
  if (confirm2.toLowerCase() !== 'yes') {
    console.log('\n❌ Please stop your application server first to prevent conflicts.');
    rl.close();
    return;
  }
  
  const confirm3 = await askQuestion('\nAre you sure you want to proceed with the migration? (yes/no): ');
  if (confirm3.toLowerCase() !== 'yes') {
    console.log('\n❌ Migration cancelled.');
    rl.close();
    return;
  }
  
  rl.close();
  
  console.log('\n🚀 Starting migration...');
  
  const migration = new DatabaseMigration();
  await migration.run();
}

main().catch(console.error);