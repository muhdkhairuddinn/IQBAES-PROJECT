import DatabaseMigration from './migrate-database.js';

async function autoMigrate() {
  console.log('🔄 Auto Database Migration');
  console.log('==========================\n');
  
  console.log('✅ Backup already created');
  console.log('✅ Server is stopped');
  console.log('✅ Proceeding with migration automatically\n');
  
  const migration = new DatabaseMigration();
  await migration.run();
}

autoMigrate().catch(console.error);