import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Submission from '../models/Submission.js';

dotenv.config();

const cleanupDuplicateSubmissions = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/iqbaes', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Find all submissions
    const allSubmissions = await Submission.find({}).lean();
    console.log(`📊 Found ${allSubmissions.length} total submissions`);

    // Group submissions by userId and examId
    const submissionsByUserExam = {};
    allSubmissions.forEach(sub => {
      const userId = sub.userId?.toString() || sub.userId;
      const examId = sub.examId?.toString() || sub.examId;
      const key = `${userId}_${examId}`;
      if (!submissionsByUserExam[key]) {
        submissionsByUserExam[key] = [];
      }
      submissionsByUserExam[key].push(sub);
    });

    console.log(`📊 Grouped into ${Object.keys(submissionsByUserExam).length} user/exam pairs`);

    // For each user/exam pair, check if there are flagged submissions
    // If yes, remove ALL non-invalidated 0% duplicates (including placeholders)
    let totalDeleted = 0;
    const allDuplicateIds = [];

    for (const [key, userExamSubmissions] of Object.entries(submissionsByUserExam)) {
      // Check if there are any flagged (invalidated) submissions
      const flaggedSubmissions = userExamSubmissions.filter(s => Boolean(s.flagged) === true);
      
      if (flaggedSubmissions.length > 0) {
        // There are flagged (invalidated) submissions, so remove ALL non-invalidated 0% duplicates
        const duplicatesToDelete = userExamSubmissions.filter(s => {
          const isFlagged = Boolean(s.flagged) === true;
          const isZeroScore = (s.totalPointsAwarded || 0) === 0;
          // Delete if: not flagged AND 0% score
          return !isFlagged && isZeroScore;
        });

        if (duplicatesToDelete.length > 0) {
          const duplicateIds = duplicatesToDelete.map(s => s._id);
          allDuplicateIds.push(...duplicateIds);
          console.log(`🧹 Found ${duplicatesToDelete.length} duplicate(s) for ${key}:`);
          duplicatesToDelete.forEach(sub => {
            console.log(`  🗑️  - ${sub._id} (flagged: ${sub.flagged}, isPlaceholder: ${sub.isPlaceholder || false}, score: ${sub.totalPointsAwarded}%)`);
          });
        }
      }
    }

    // Delete all duplicates in one operation
    if (allDuplicateIds.length > 0) {
      console.log(`\n🗑️  Deleting ${allDuplicateIds.length} duplicate submission(s)...`);
      const deleteResult = await Submission.deleteMany({
        _id: { $in: allDuplicateIds }
      });
      totalDeleted = deleteResult.deletedCount;
      console.log(`✅ Deleted ${totalDeleted} duplicate submission(s)`);
    } else {
      console.log(`✅ No duplicates found - database is clean!`);
    }

    // Summary
    console.log(`\n📊 Cleanup Summary:`);
    console.log(`  - Total submissions: ${allSubmissions.length}`);
    console.log(`  - Duplicates found: ${allDuplicateIds.length}`);
    console.log(`  - Duplicates deleted: ${totalDeleted}`);
    console.log(`  - Remaining submissions: ${allSubmissions.length - totalDeleted}`);

    await mongoose.connection.close();
    console.log('✅ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error cleaning up duplicates:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

cleanupDuplicateSubmissions();

