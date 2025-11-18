import mongoose from 'mongoose';

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/iqbaes');

// Define SystemLogs schema
const SystemLogs = mongoose.model('SystemLogs', new mongoose.Schema({}, {strict: false}));

async function checkUnknownUsers() {
  try {
    // Find violations with missing or empty userName
    const violations = await SystemLogs.find({
      type: 'violation',
      $or: [
        { userName: null },
        { userName: undefined },
        { userName: '' },
        { userName: 'Unknown Student' }
      ]
    }).limit(10);

    console.log(`Found ${violations.length} violations with missing/unknown userNames:`);
    
    violations.forEach((doc, index) => {
      console.log(`\n${index + 1}. ID: ${doc._id}`);
      console.log(`   userName: ${doc.userName}`);
      console.log(`   userId: ${doc.userId}`);
      console.log(`   message: ${doc.message}`);
      console.log(`   details: ${JSON.stringify(doc.details, null, 2)}`);
    });

    // Also check total count
    const totalCount = await SystemLogs.countDocuments({
      type: 'violation',
      $or: [
        { userName: null },
        { userName: undefined },
        { userName: '' },
        { userName: 'Unknown Student' }
      ]
    });

    console.log(`\nTotal violations with unknown users: ${totalCount}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit();
  }
}

checkUnknownUsers();