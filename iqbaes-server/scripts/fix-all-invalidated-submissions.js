/**
 * Comprehensive script to fix ALL invalidated submissions
 * This script:
 * 1. Finds all submissions with "Cheating is not allowed" answers (indicating invalidation)
 * 2. Sets flagged: true if not set
 * 3. Sets flaggedAt to today if missing or old
 * 4. Updates submittedAt to today if it's old (more than 1 day ago)
 * 
 * Usage: node iqbaes-server/scripts/fix-all-invalidated-submissions.js
 */

import mongoose from 'mongoose';
import Submission from '../models/Submission.js';
import connectDB from '../config/db.js';

const fixAllInvalidatedSubmissions = async () => {
  try {
    await connectDB();
    console.log('🔌 Connected to database');
    
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    console.log(`📅 Current date: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`);
    console.log(`🔍 Looking for invalidated submissions...`);
    
    // Find ALL submissions (we'll check each one)
    const allSubmissions = await Submission.find({}).sort({ submittedAt: -1 });
    
    console.log(`📋 Found ${allSubmissions.length} total submission(s)`);
    
    let fixedCount = 0;
    let flaggedCount = 0;
    let dateFixedCount = 0;
    let skippedCount = 0;
    
    for (const submission of allSubmissions) {
      let needsUpdate = false;
      const updates = {};
      
      // Check if submission has "Cheating is not allowed" answers (indicating invalidation)
      const hasCheatingAnswers = submission.results && submission.results.some(result => 
        result.userAnswer && 
        String(result.userAnswer.answer) === 'Cheating is not allowed'
      );
      
      // Check if submission has 0% score (might indicate invalidation)
      const hasZeroScore = submission.totalPointsAwarded === 0 && submission.totalPointsPossible > 0;
      
      // If submission has cheating answers or 0% score, it might be invalidated
      if (hasCheatingAnswers || (hasZeroScore && !submission.flagged)) {
        console.log(`\n🔍 Checking submission ${submission._id}:`);
        console.log(`  - Has cheating answers: ${hasCheatingAnswers}`);
        console.log(`  - Has zero score: ${hasZeroScore}`);
        console.log(`  - Currently flagged: ${submission.flagged}`);
        console.log(`  - Submitted at: ${submission.submittedAt?.toLocaleDateString()}`);
        console.log(`  - Flagged at: ${submission.flaggedAt?.toLocaleDateString() || 'N/A'}`);
        
        // If submission has cheating answers but is not flagged, flag it
        if (hasCheatingAnswers && !submission.flagged) {
          console.log(`  🔧 Setting flagged: true`);
          updates.flagged = true;
          updates.flagReason = submission.flagReason || 'Admin invalidated session';
          updates.flaggedAt = submission.flaggedAt || now;
          updates.flaggedBy = submission.flaggedBy || 'Admin';
          flaggedCount++;
          needsUpdate = true;
        }
        
        // If flagged but flaggedAt is missing or old, update it
        if (submission.flagged && (!submission.flaggedAt || new Date(submission.flaggedAt) < oneDayAgo)) {
          console.log(`  🔧 Updating flaggedAt to today`);
          updates.flaggedAt = now;
          if (!submission.flagReason) {
            updates.flagReason = 'Admin invalidated session';
          }
          if (!submission.flaggedBy) {
            updates.flaggedBy = 'Admin';
          }
          needsUpdate = true;
        }
        
        // If submittedAt is more than 1 day ago and submission is flagged, update it to flaggedAt (or today)
        if (submission.flagged) {
          const submittedAt = new Date(submission.submittedAt);
          const flaggedAt = submission.flaggedAt ? new Date(submission.flaggedAt) : now;
          
          // If submittedAt is more than 1 day older than flaggedAt, update it
          const timeDiff = flaggedAt.getTime() - submittedAt.getTime();
          const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
          
          if (daysDiff > 1) {
            console.log(`  🔧 Updating submittedAt from ${submittedAt.toLocaleDateString()} to ${flaggedAt.toLocaleDateString()}`);
            updates.submittedAt = flaggedAt;
            dateFixedCount++;
            needsUpdate = true;
          } else if (submittedAt < oneDayAgo) {
            // If submittedAt is more than 1 day ago, update it to today
            console.log(`  🔧 Updating submittedAt from ${submittedAt.toLocaleDateString()} to today`);
            updates.submittedAt = now;
            dateFixedCount++;
            needsUpdate = true;
          }
        }
        
        // Apply updates if needed
        if (needsUpdate) {
          Object.assign(submission, updates);
          await submission.save();
          console.log(`  ✅ Updated submission ${submission._id}`);
          fixedCount++;
        } else {
          console.log(`  ⏭️  Skipping submission ${submission._id} - no updates needed`);
          skippedCount++;
        }
      } else {
        skippedCount++;
      }
    }
    
    console.log(`\n✅ Fix complete!`);
    console.log(`  - Total checked: ${allSubmissions.length} submission(s)`);
    console.log(`  - Flagged: ${flaggedCount} submission(s)`);
    console.log(`  - Date fixed: ${dateFixedCount} submission(s)`);
    console.log(`  - Total fixed: ${fixedCount} submission(s)`);
    console.log(`  - Skipped: ${skippedCount} submission(s)`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing invalidated submissions:', error);
    process.exit(1);
  }
};

// Run the script
fixAllInvalidatedSubmissions();

