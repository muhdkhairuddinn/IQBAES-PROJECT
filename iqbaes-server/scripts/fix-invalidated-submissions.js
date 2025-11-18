/**
 * Script to fix invalidated submissions with old dates
 * This script updates submissions that were invalidated recently (within last 24 hours)
 * but have old submittedAt dates (more than 1 day older than flaggedAt)
 * 
 * Usage: node iqbaes-server/scripts/fix-invalidated-submissions.js
 */

import mongoose from 'mongoose';
import Submission from '../models/Submission.js';
import connectDB from '../config/db.js';

const fixInvalidatedSubmissions = async () => {
  try {
    await connectDB();
    console.log('🔌 Connected to database');
    
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    console.log(`📅 Current date: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`);
    console.log(`🔍 Looking for submissions invalidated within last 24 hours with old dates...`);
    
    // Find all flagged submissions that were invalidated recently
    const flaggedSubmissions = await Submission.find({
      flagged: true,
      flaggedAt: { $gte: oneDayAgo }
    }).sort({ flaggedAt: -1 });
    
    console.log(`📋 Found ${flaggedSubmissions.length} recently invalidated submission(s)`);
    
    let fixedCount = 0;
    let skippedCount = 0;
    
    for (const submission of flaggedSubmissions) {
      const flaggedAt = new Date(submission.flaggedAt);
      const submittedAt = new Date(submission.submittedAt);
      
      // Check if submittedAt is more than 1 day older than flaggedAt
      const timeDiff = flaggedAt.getTime() - submittedAt.getTime();
      const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
      
      if (daysDiff > 1) {
        // This submission was invalidated recently but has an old date
        console.log(`\n🔧 Fixing submission ${submission._id}:`);
        console.log(`  - Flagged at: ${flaggedAt.toLocaleDateString()} ${flaggedAt.toLocaleTimeString()}`);
        console.log(`  - Old submittedAt: ${submittedAt.toLocaleDateString()} ${submittedAt.toLocaleTimeString()}`);
        console.log(`  - Days difference: ${daysDiff.toFixed(1)}`);
        
        // Update submittedAt to flaggedAt (when it was invalidated)
        // This ensures the submission shows the date it was invalidated, not the original date
        submission.submittedAt = flaggedAt;
        await submission.save();
        
        console.log(`  ✅ Updated submittedAt to: ${flaggedAt.toLocaleDateString()} ${flaggedAt.toLocaleTimeString()}`);
        fixedCount++;
      } else {
        console.log(`  ⏭️  Skipping submission ${submission._id} - date is correct (${daysDiff.toFixed(1)} days difference)`);
        skippedCount++;
      }
    }
    
    console.log(`\n✅ Fix complete!`);
    console.log(`  - Fixed: ${fixedCount} submission(s)`);
    console.log(`  - Skipped: ${skippedCount} submission(s)`);
    console.log(`  - Total checked: ${flaggedSubmissions.length} submission(s)`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing invalidated submissions:', error);
    process.exit(1);
  }
};

// Run the script
fixInvalidatedSubmissions();

