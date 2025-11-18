import mongoose from 'mongoose';
import Submission from '../models/Submission.js';
import Exam from '../models/Exam.js';
import User from '../models/User.js';
import UserEnrollments from '../models/UserEnrollments.js';
import SystemLogs from '../models/SystemLogs.js';
import LiveExamSession from '../models/LiveExamSession.js';
import { getIO } from '../socket.js';
import { gradeSubmission } from '../utils/grading.js';
import { getClientIp } from '../utils/getClientIp.js';

// @desc    Get user submissions
// @route   GET /api/submissions
// @access  Private
const getSubmissions = async (req, res) => {
  try {
    console.log('Getting submissions for user:', req.user.username);
    
    let submissions;
    if (req.user.role === 'admin') {
      submissions = await Submission.find({})
        .populate('examId', 'title')
        .populate('courseId', 'name')
        .populate('userId', 'name username')
        .sort({ submittedAt: -1 });
    } else if (req.user.role === 'lecturer') {
      submissions = await Submission.find({ 
        courseId: { $in: req.user.enrolledCourseIds } 
      })
        .populate('examId', 'title')
        .populate('courseId', 'name')
        .populate('userId', 'name username')
        .sort({ submittedAt: -1 });
    } else {
      submissions = await Submission.find({ userId: req.user.id || req.user._id })
        .populate('examId', 'title')
        .populate('courseId', 'name')
        .sort({ submittedAt: -1 });
    }

    // AUTO-FIX: Fix invalidated submissions
    // This ensures submissions with "Cheating is not allowed" answers are properly flagged
    // and have correct dates
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    let fixedCount = 0;
    let flaggedCount = 0;
    
    for (const submission of submissions) {
      let needsUpdate = false;
      
      // IMPORTANT: Skip placeholder submissions in auto-fix logic
      // Placeholder submissions are only for retake permission tracking and shouldn't be modified
      // They will be filtered out when displaying history anyway
      if (submission.isPlaceholder === true) {
        continue; // Skip placeholder submissions
      }
      
      // Check if submission has "Cheating is not allowed" answers (indicating invalidation)
      const hasCheatingAnswers = submission.results && submission.results.some(result => 
        result.userAnswer && 
        String(result.userAnswer.answer) === 'Cheating is not allowed'
      );
      
      // If submission has cheating answers but is not flagged, flag it
      if (hasCheatingAnswers && !submission.flagged) {
        console.log(`🔧 Auto-flagging submission ${submission._id} (has cheating answers but not flagged)`);
        submission.flagged = true;
        submission.flagReason = submission.flagReason || 'Admin invalidated session';
        submission.flaggedAt = submission.flaggedAt || now;
        submission.flaggedBy = submission.flaggedBy || 'Admin';
        flaggedCount++;
        needsUpdate = true;
      }
      
      // If submission is flagged, fix dates if needed
      if (submission.flagged) {
        const flaggedAt = submission.flaggedAt ? new Date(submission.flaggedAt) : now;
        const submittedAt = new Date(submission.submittedAt);
        
        // If flaggedAt is missing or very old, set it to now
        if (!submission.flaggedAt || flaggedAt < oneDayAgo) {
          submission.flaggedAt = now;
          needsUpdate = true;
        }
        
        // If submittedAt is more than 1 day older than flaggedAt, update it to flaggedAt
        const timeDiff = flaggedAt.getTime() - submittedAt.getTime();
        const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
        
        if (daysDiff > 1) {
          console.log(`🔧 Auto-fixing submission ${submission._id} date from ${submittedAt.toLocaleDateString()} to ${flaggedAt.toLocaleDateString()}`);
          submission.submittedAt = flaggedAt;
          needsUpdate = true;
        }
      }
      
      // Save if updates were made
      if (needsUpdate) {
        await submission.save();
        fixedCount++;
      }
    }
    
    if (fixedCount > 0) {
      console.log(`✅ Auto-fixed ${fixedCount} submission(s): ${flaggedCount} flagged, ${fixedCount - flaggedCount} dates fixed`);
    }
    
    // CRITICAL: Clean up ALL duplicate non-invalidated 0% submissions
    // Rule: If there are any flagged (invalidated) submissions for a user/exam, 
    // delete ALL non-invalidated 0% submissions (including placeholders) for that user/exam
    // This ensures exam history shows only real attempts and invalidations, not redundant placeholders
    try {
      // Group submissions by userId and examId
      const submissionsByUserExam = {};
      submissions.forEach(sub => {
        const userId = sub.userId?.toString() || sub.userId;
        const examId = sub.examId?.toString() || sub.examId;
        const key = `${userId}_${examId}`;
        if (!submissionsByUserExam[key]) {
          submissionsByUserExam[key] = [];
        }
        submissionsByUserExam[key].push(sub);
      });
      
      // For each user/exam pair, check if there are flagged submissions
      // If yes, remove ALL non-invalidated 0% duplicates (including placeholders)
      let totalDeleted = 0;
      const allDuplicateIds = [];
      
      for (const [key, userExamSubmissions] of Object.entries(submissionsByUserExam)) {
        // Check if there are any flagged (invalidated) submissions
        // Use explicit check for true, treating undefined/null/false as not flagged
        const flaggedSubmissions = userExamSubmissions.filter(s => Boolean(s.flagged) === true);
        if (flaggedSubmissions.length > 0) {
          // There are flagged (invalidated) submissions, so remove ALL non-invalidated 0% duplicates
          // This includes placeholders - they shouldn't appear in history when there's an invalidated submission
          // CRITICAL: Delete ALL non-invalidated 0% submissions (including placeholders) to prevent duplicates
          // EXCEPT: Don't delete submissions that have isRetakeAllowed: true (actively being used for retake management)
          const duplicatesToDelete = userExamSubmissions.filter(s => {
            const isFlagged = Boolean(s.flagged) === true;
            const isZeroScore = (s.totalPointsAwarded || 0) === 0;
            const hasRetakeAllowed = Boolean(s.isRetakeAllowed) === true;
            // Delete if: not flagged AND 0% score AND NOT actively used for retake management
            // This includes placeholders and any other 0% entries that aren't invalidated
            // But preserve submissions that are actively being used for retake management
            return !isFlagged && isZeroScore && !hasRetakeAllowed;
          });
          
          if (duplicatesToDelete.length > 0) {
            const duplicateIds = duplicatesToDelete.map(s => s._id);
            allDuplicateIds.push(...duplicateIds);
            console.log(`🧹 Found ${duplicatesToDelete.length} duplicate non-invalidated 0% submission(s) for ${key} (excluding retake-active ones)`);
            duplicatesToDelete.forEach(sub => {
              console.log(`  🗑️ Will delete: ${sub._id} (flagged: ${sub.flagged}, isPlaceholder: ${sub.isPlaceholder || false}, isRetakeAllowed: ${sub.isRetakeAllowed || false}, score: ${sub.totalPointsAwarded}%)`);
            });
          }
        }
      }
      
      // Delete all duplicates in one operation
      if (allDuplicateIds.length > 0) {
        const deleteResult = await Submission.deleteMany({
          _id: { $in: allDuplicateIds }
        });
        totalDeleted = deleteResult.deletedCount;
        console.log(`✅ Cleaned up ${totalDeleted} duplicate non-invalidated 0% submission(s) (including placeholders)`);
        
        // Re-fetch submissions after cleanup to ensure we return the correct data
        if (req.user.role === 'admin') {
          submissions = await Submission.find({})
            .populate('examId', 'title')
            .populate('courseId', 'name')
            .populate('userId', 'name username')
            .sort({ submittedAt: -1 });
        } else if (req.user.role === 'lecturer') {
          submissions = await Submission.find({ 
            courseId: { $in: req.user.enrolledCourseIds } 
          })
            .populate('examId', 'title')
            .populate('courseId', 'name')
            .populate('userId', 'name username')
            .sort({ submittedAt: -1 });
        } else {
          submissions = await Submission.find({ userId: req.user.id || req.user._id })
            .populate('examId', 'title')
            .populate('courseId', 'name')
            .sort({ submittedAt: -1 });
        }
        
        // Re-run auto-fix after cleanup
        const now = new Date();
        for (const submission of submissions) {
          if (submission.isPlaceholder === true) continue;
          
          const hasCheatingAnswers = submission.results && submission.results.some(result => 
            result.userAnswer && 
            String(result.userAnswer.answer) === 'Cheating is not allowed'
          );
          
          if (hasCheatingAnswers && !submission.flagged) {
            submission.flagged = true;
            submission.flagReason = submission.flagReason || 'Admin invalidated session';
            submission.flaggedAt = submission.flaggedAt || now;
            submission.flaggedBy = submission.flaggedBy || 'Admin';
            await submission.save();
          }
        }
      }
    } catch (cleanupError) {
      console.error(`⚠️ Error during cleanup of duplicate submissions in getSubmissions:`, cleanupError);
      // Don't fail the request if cleanup fails
    }

    // Calculate score percentage for each submission
    // IMPORTANT: Include ALL submissions (including placeholders) so frontend can check retake permissions
    // Placeholder submissions are filtered out in the frontend (HistoryView component) when displaying history
    // This ensures placeholders exist for retake permission tracking but don't appear in history
    const submissionsWithScore = submissions.map(submission => {
      const submissionJSON = submission.toJSON();
      return {
        ...submissionJSON,
        // Explicitly include flagged fields to ensure they're not missing
        flagged: Boolean(submission.flagged),
        flagReason: submission.flagReason || null,
        flaggedAt: submission.flaggedAt || null,
        flaggedBy: submission.flaggedBy || null,
        // Explicitly include isPlaceholder field so frontend can filter it out
        isPlaceholder: Boolean(submission.isPlaceholder),
        score: submission.totalPointsAwarded,
        totalPoints: submission.totalPointsPossible,
        percentage: Math.round((submission.totalPointsAwarded / submission.totalPointsPossible) * 100)
      };
    });

    // Log invalidated submissions count for debugging
    const invalidatedCount = submissions.filter(s => Boolean(s.flagged) === true).length;
    const placeholderCount = submissions.filter(s => Boolean(s.isPlaceholder) === true).length;
    console.log(`Found ${submissions.length} submissions for user ${req.user.username}:`);
    console.log(`  📋 Invalidated (flagged): ${invalidatedCount} entries`);
    console.log(`  📋 Placeholders: ${placeholderCount} entries`);
    console.log(`  📋 Regular submissions: ${submissions.length - invalidatedCount - placeholderCount} entries`);
    
    // If user is a student, log all their invalidated submissions grouped by exam
    if (req.user.role === 'student') {
      const invalidatedByExam = {};
      submissions.filter(s => Boolean(s.flagged) === true).forEach(sub => {
        const examId = sub.examId?.toString() || sub.examId?._id?.toString() || 'unknown';
        if (!invalidatedByExam[examId]) {
          invalidatedByExam[examId] = [];
        }
        invalidatedByExam[examId].push({
          id: sub._id.toString(),
          submittedAt: sub.submittedAt,
          flaggedAt: sub.flaggedAt
        });
      });
      
      Object.keys(invalidatedByExam).forEach(examId => {
        if (invalidatedByExam[examId].length > 1) {
          console.log(`  ⚠️ Exam ${examId} has ${invalidatedByExam[examId].length} invalidated entries (should show all in history)`);
          invalidatedByExam[examId].forEach((entry, idx) => {
            console.log(`    ${idx + 1}. ID: ${entry.id}, submittedAt: ${entry.submittedAt?.toLocaleDateString()} ${entry.submittedAt?.toLocaleTimeString()}`);
          });
        }
      });
    }
    
    res.json(submissionsWithScore);
  } catch (error) {
    console.error('Error getting submissions:', error);
    res.status(500).json({ message: 'Server error', details: error.message });
  }
};

// @desc    Create new submission
// @route   POST /api/submissions
// @access  Private
const createSubmission = async (req, res) => {
  try {
    const { examId, answers } = req.body;
    const userId = req.user.id || req.user._id;

    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    // Check for existing submissions (including placeholders)
    // NOTE: We need to check ALL submissions to find the one with retake permission
    // Placeholder submissions can have isRetakeAllowed: true
    const existingSubmissions = await Submission.find({ examId, userId }).sort({ submittedAt: -1 });
    
    // Find the submission with retake permission (could be a placeholder or real submission)
    const submissionWithRetake = existingSubmissions.find(sub => sub.isRetakeAllowed === true);
    
    // Calculate non-placeholder submissions for attempt number calculation
    const nonPlaceholderSubmissions = existingSubmissions.filter(sub => !sub.isPlaceholder);
    
    if (existingSubmissions.length > 0) {
      // If no submission has retake permission, student can't take the exam
      if (!submissionWithRetake) {
        return res.status(400).json({ message: 'You have already submitted this exam.' });
      }
      
      // Check if max attempts reached (only count non-placeholder submissions for attempt limits)
      const latestNonPlaceholder = nonPlaceholderSubmissions[0];
      
      if (latestNonPlaceholder && latestNonPlaceholder.attemptNumber >= submissionWithRetake.maxAttempts) {
        return res.status(400).json({ message: 'Maximum number of attempts reached.' });
      }
      
      // Revoke retake permission from the submission (whether placeholder or real)
      // If it's a placeholder, it will remain as isPlaceholder: true and won't appear in history
      // If it's a real submission, it will remain visible in history but retake will be revoked
      submissionWithRetake.isRetakeAllowed = false;
      submissionWithRetake.retakeRevokedAt = new Date();
      submissionWithRetake.retakeRevokedBy = userId; // Mark as used by the student
      await submissionWithRetake.save();
      
      console.log(`✅ Revoked retake permission from submission ${submissionWithRetake._id} (isPlaceholder: ${submissionWithRetake.isPlaceholder})`);
    }

    const { results, totalPointsAwarded, totalPointsPossible } = await gradeSubmission(exam, answers);

    // Determine attempt number - only count non-placeholder submissions
    // Placeholder submissions don't count as attempts since the student hasn't taken the exam yet
    const attemptNumber = nonPlaceholderSubmissions.length > 0 
      ? ((nonPlaceholderSubmissions[0].attemptNumber || nonPlaceholderSubmissions.length) + 1)
      : 1;

    // Get maxAttempts from the submission with retake permission (if exists)
    // Otherwise, use the most recent non-placeholder submission's maxAttempts
    const maxAttempts = submissionWithRetake 
      ? submissionWithRetake.maxAttempts 
      : (nonPlaceholderSubmissions.length > 0 
          ? nonPlaceholderSubmissions[0].maxAttempts 
          : 1);

    const submission = new Submission({
      examId,
      courseId: exam.courseId,
      userId,
      results,
      totalPointsAwarded,
      totalPointsPossible,
      submittedAt: new Date(),
      attemptNumber,
      isRetakeAllowed: false, // New submissions don't have retake permission by default
      maxAttempts: maxAttempts,
      isPlaceholder: false, // CRITICAL: Actual exam submissions are NOT placeholders
    });

    const createdSubmission = await submission.save();
    
    // Close the LiveExamSession when exam is submitted
    try {
      // Find sessions first to get their IDs for WebSocket emission
      const sessionsToClose = await LiveExamSession.find({
        userId,
        examId,
        status: { $in: ['active', 'flagged'] }
      }).lean();
      
      if (sessionsToClose.length > 0) {
        // Close the sessions
        await LiveExamSession.updateMany(
          { userId, examId, status: { $in: ['active', 'flagged'] } },
          { $set: { status: 'submitted', lastHeartbeat: new Date() } }
        );
        console.log('✅ Closed LiveExamSession for submitted exam');
        
        // Emit WebSocket events to remove each session from monitoring dashboard immediately
        const io = getIO();
        if (io) {
          const user = await User.findById(userId).select('name username').lean();
          // Emit removal for each closed session
          sessionsToClose.forEach(session => {
            const payload = {
              sessionId: session._id.toString(), // Use actual session ID
              userId: userId.toString(),
              userName: user?.name || req.user?.name || req.user?.username || 'Unknown',
              examId: examId.toString(),
              examTitle: exam.title,
              status: 'submitted', // This will trigger removal in dashboard
            };
            io.to(`exam_${examId}`).emit('live_session_updated', payload);
            io.to('monitoring_all').emit('live_session_updated', payload);
          });
          console.log(`📤 Emitted session removal for ${sessionsToClose.length} session(s) to exam_${examId} and monitoring_all`);
        }
      }
    } catch (sessionError) {
      console.warn('Warning closing LiveExamSession:', sessionError);
    }
    
    // Log submission creation to database
    try {
      const submissionCreatedLog = new SystemLogs({
        userId: userId,
        userName: req.user.username,
        type: 'submission_created',
        message: `Submission created for exam: ${exam.title} (Attempt ${attemptNumber}, Score: ${totalPointsAwarded}/${totalPointsPossible})`,
        details: {
          examId: examId,
          examTitle: exam.title,
          attemptNumber: attemptNumber,
          score: `${totalPointsAwarded}/${totalPointsPossible}`,
          submissionId: createdSubmission._id
        },
        timestamp: new Date(),
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      });
      await submissionCreatedLog.save();
    } catch (logError) {
      console.error('Failed to log submission creation:', logError);
    }
    
    res.status(201).json(createdSubmission.toJSON());

  } catch (error) {
    console.error('Submission Error:', error);
    res.status(500).json({ message: 'Failed to create submission', details: error.message });
  }
};

// @desc    Update submission with manual grades
// @route   PUT /api/submissions/:id
// @access  Private/Lecturer
const updateSubmission = async (req, res) => {
  try {
    const { id } = req.params;
    const { results } = req.body;

    const submission = await Submission.findById(id).populate('examId userId');
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    // Update results
    if (results) {
      submission.results = results;
      // Recalculate total points
      submission.totalPointsAwarded = results.reduce((sum, result) => {
        const points = result.lecturerOverridePoints !== undefined 
          ? result.lecturerOverridePoints 
          : result.pointsAwarded;
        return sum + points;
      }, 0);
    }

    await submission.save();
    res.json(submission.toJSON());
  } catch (error) {
    console.error('Error updating submission:', error);
    res.status(500).json({ message: 'Server error', details: error.message });
  }
};

// @desc    Get analytics data for lecturer dashboard
// @route   GET /api/submissions/analytics
// @access  Private/Lecturer
const getAnalytics = async (req, res) => {
  try {
    const { courseId, timeRange } = req.query;
    const userId = req.user.id || req.user._id;

    // Build query based on user role
    let query = {};

    if (req.user.role === 'lecturer') {
      // Lecturer can only see submissions for their courses
      if (courseId && courseId !== 'all') {
        query.courseId = courseId;
      } else {
        // Get all courses this lecturer is enrolled in
        const userEnrollments = await UserEnrollments.find({ userId });
        const courseIds = userEnrollments.map(enrollment => enrollment.courseId);
        query.courseId = { $in: courseIds };
      }
    } else if (req.user.role === 'admin') {
      // Admin can see all submissions
      if (courseId && courseId !== 'all') {
        // Get all exams for this course
        const exams = await Exam.find({ courseId });
        const examIds = exams.map(exam => exam._id);
        query.examId = { $in: examIds };
      }
    }
    // For admin with "All Courses", no additional filtering needed
    
    // Apply time range filter
    if (timeRange && timeRange !== 'all') {
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      
      // Get the most recent submission date to use as reference for intelligent time filtering
      // This ensures the time ranges work with existing data regardless of current system date
      const mostRecentSubmission = await Submission.findOne({}, {}, { sort: { 'submittedAt': -1 } });
      
      if (mostRecentSubmission) {
        // Use the most recent submission date as the "current" reference point
        const referenceDate = mostRecentSubmission.submittedAt;
        const cutoffDate = new Date(referenceDate.getTime() - (days * 24 * 60 * 60 * 1000));
        query.submittedAt = { $gte: cutoffDate };
        console.log(`[Analytics] Reference date (most recent submission): ${referenceDate.toISOString()}`);
        console.log(`[Analytics] Time range filter: ${timeRange} (${days} days), cutoff date: ${cutoffDate.toISOString()}`);
      } else {
        // Fallback to current date if no submissions exist
        const now = new Date();
        const cutoffDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
        query.submittedAt = { $gte: cutoffDate };
        console.log(`[Analytics] No submissions found, using current date: ${now.toISOString()}`);
        console.log(`[Analytics] Time range filter: ${timeRange} (${days} days), cutoff date: ${cutoffDate.toISOString()}`);
      }
    }

    console.log(`[Analytics] Query:`, JSON.stringify(query, null, 2));
    
    const submissions = await Submission.find(query)
      .populate('examId', 'title')
      .populate('courseId', 'name')
      .populate('userId', 'name username')
      .populate({
        path: 'results.question',
        model: 'Question',
        select: 'text question topic points'
      });
      
    console.log(`[Analytics] Found ${submissions.length} submissions for timeRange: ${timeRange}, courseId: ${courseId}`);
    
    // Calculate analytics
    const totalSubmissions = submissions.length;
    const totalStudents = new Set(submissions.map(s => String(s.userId?._id || s.userId))).size;
    const averageScore = totalSubmissions > 0
      ? submissions.reduce((sum, s) => sum + (s.totalPointsAwarded / s.totalPointsPossible) * 100, 0) / totalSubmissions
      : 0;

    // Group by exam
    const examStats = {};
    submissions.forEach(submission => {
      const examId = String(submission.examId?._id || submission.examId);
      if (!examStats[examId]) {
        examStats[examId] = {
          examId,
          examTitle: submission.examId?.title || 'Unknown',
          totalSubmissions: 0,
          totalStudents: new Set(),
          totalPoints: 0,
          maxPoints: 0
        };
      }
      examStats[examId].totalSubmissions++;
      examStats[examId].totalStudents.add(String(submission.userId?._id || submission.userId));
      examStats[examId].totalPoints += submission.totalPointsAwarded;
      examStats[examId].maxPoints += submission.totalPointsPossible;
    });

    // Convert to array and calculate averages
    const examStatsArray = Object.values(examStats).map(stat => ({
      ...stat,
      totalStudents: stat.totalStudents.size,
      averageScore: stat.maxPoints > 0 ? (stat.totalPoints / stat.maxPoints) * 100 : 0
    }));

    // Calculate completion rate (simplified: percentage of students who submitted)
    // For now, we'll use 100% if there are submissions, 0% otherwise
    // This can be enhanced later to compare against enrolled students
    const completionRate = totalSubmissions > 0 ? 100 : 0;

    // Calculate question difficulty analysis
    const questionStats = {};
    submissions.forEach(submission => {
      if (submission.results && Array.isArray(submission.results)) {
        submission.results.forEach(result => {
          const questionId = result.questionId || result.question?.id || String(result.question?._id || 'unknown');
          if (!questionStats[questionId]) {
            questionStats[questionId] = {
              correct: 0,
              total: 0,
              text: result.question?.text || result.question?.question || 'Unknown Question',
              topic: result.question?.topic || 'General'
            };
          }
          questionStats[questionId].total++;
          
          // Check if answer is correct
          const isCorrect = result.lecturerOverridePoints !== undefined
            ? result.lecturerOverridePoints > (result.question?.points || 1) * 0.5
            : result.isCorrect || false;
          
          if (isCorrect) {
            questionStats[questionId].correct++;
          }
        });
      }
    });

    const questionDifficulty = Object.entries(questionStats).map(([questionId, stats]) => ({
      questionId,
      text: stats.text,
      topic: stats.topic,
      correctRate: stats.total > 0 ? (stats.correct / stats.total) * 100 : 0,
      difficulty: stats.total > 0 ? 100 - ((stats.correct / stats.total) * 100) : 0
    })).sort((a, b) => b.difficulty - a.difficulty);

    // Calculate student performance
    const studentStats = {};
    submissions.forEach(submission => {
      const studentId = String(submission.userId?._id || submission.userId || 'unknown');
      if (!studentStats[studentId]) {
        studentStats[studentId] = {
          scores: [],
          name: submission.userId?.name || submission.userId?.username || 'Unknown User'
        };
      }
      const score = submission.totalPointsPossible > 0
        ? (submission.totalPointsAwarded / submission.totalPointsPossible) * 100
        : 0;
      studentStats[studentId].scores.push(score);
    });

    const studentPerformance = Object.entries(studentStats).map(([studentId, stats]) => {
      const averageScore = stats.scores.length > 0
        ? stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length
        : 0;
      
      // Simple trend calculation
      let trend = 'stable';
      if (stats.scores.length >= 2) {
        const firstHalf = stats.scores.slice(0, Math.floor(stats.scores.length / 2));
        const secondHalf = stats.scores.slice(Math.floor(stats.scores.length / 2));
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        
        if (secondAvg > firstAvg + 5) trend = 'up';
        else if (secondAvg < firstAvg - 5) trend = 'down';
      }

      return {
        studentId,
        name: stats.name,
        averageScore,
        trend,
        submissionCount: stats.scores.length
      };
    }).sort((a, b) => b.averageScore - a.averageScore);

    res.json({
      totalSubmissions,
      totalStudents, // Already a number (Set.size)
      averageScore: Math.round(averageScore * 100) / 100,
      completionRate,
      questionDifficulty,
      studentPerformance,
      examStats: examStatsArray
    });
  } catch (error) {
    console.error('Error getting analytics:', error);
    res.status(500).json({ message: 'Server error', details: error.message });
  }
};

// @desc    Allow retake for a submission
// @route   PUT /api/submissions/:id/allow-retake
// @access  Private/Admin/Lecturer
const allowRetake = async (req, res) => {
  try {
    const { id } = req.params;
    const { maxAttempts } = req.body;

    const submission = await Submission.findById(id).populate('examId userId');
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    // Validate maxAttempts if provided
    if (maxAttempts && maxAttempts <= submission.attemptNumber) {
      return res.status(400).json({ 
        message: `Maximum attempts (${maxAttempts}) must be greater than current attempt number (${submission.attemptNumber})` 
      });
    }

    // IMPORTANT: Keep flagged status when granting retake
    // The frontend already supports retakes even when flagged: true (it only checks isRetakeAllowed)
    // This prevents creating problematic unflagged 0% submissions that need cleanup later
    const wasFlagged = submission.flagged === true;

    // Update the specific submission to allow retake
    // NOTE: We do NOT unflag invalidated submissions - they should remain flagged in history
    // The frontend will allow retakes based on isRetakeAllowed, not flagged status
    const updateFields = {
      isRetakeAllowed: true,
      retakeAllowedAt: new Date(),
      retakeAllowedBy: req.user.id || req.user._id,
      // Keep flagged status - don't unflag invalidated submissions
      // This prevents creating duplicate non-invalidated 0% submissions
      retakeGrantedDespitePreviousFlag: wasFlagged // Track if this was previously flagged
    };

    if (maxAttempts) {
      updateFields.maxAttempts = maxAttempts;
    }

    const updatedSubmission = await Submission.findByIdAndUpdate(
      id,
      updateFields,
      { new: true, runValidators: false }
    ).populate('examId userId');

    // NOTE: We do NOT unflag other submissions when granting retake
    // Invalidated submissions should remain flagged in history to show they were invalidated
    // The frontend allows retakes based on isRetakeAllowed, not flagged status
    // This prevents creating duplicate non-invalidated 0% submissions that need cleanup

    console.log(`✅ Granted retake permission for student ${submission.userId._id || submission.userId} on exam ${submission.examId._id || submission.examId}. Submission ID: ${id}, Previously flagged: ${wasFlagged}, Now flagged: ${updatedSubmission.flagged}, isRetakeAllowed: ${updatedSubmission.isRetakeAllowed}`);
    
    // Log the action to activity logs - clear message for lecturer action
    const lecturerName = req.user.name || req.user.username || 'Lecturer';
    const log = new SystemLogs({
      userId: req.user.id || req.user._id,
      userName: lecturerName,
      examId: updatedSubmission.examId._id,
      type: 'submission_updated', // This is in activityTypes array
      message: `${lecturerName} granted retake exam to ${updatedSubmission.userId.name}`,
      details: JSON.stringify({
        submissionId: updatedSubmission._id,
        studentName: updatedSubmission.userId.name,
        examTitle: updatedSubmission.examId.title,
        action: 'retake_granted',
        lecturerName: lecturerName
      }),
      timestamp: new Date(),
    });
    
    await log.save();

    res.json({
      message: 'Retake allowed successfully',
      submission: updatedSubmission.toJSON()
    });
  } catch (error) {
    console.error('Error allowing retake:', error);
    res.status(500).json({ message: 'Server error', details: error.message });
  }
};

// @desc    Allow retake for a student (creates submission if needed)
// @route   POST /api/submissions/allow-retake
// @access  Private/Admin/Lecturer
const allowRetakeForStudent = async (req, res) => {
  try {
    const { examId, userId, maxAttempts } = req.body;

    if (!examId || !userId) {
      return res.status(400).json({ message: 'Exam ID and User ID are required' });
    }

    // Verify exam exists
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    // Find all existing submissions for this user/exam
    const submissions = await Submission.find({ userId, examId })
      .sort({ submittedAt: -1 });
    
    let submission;
    
    if (submissions.length === 0) {
      // No submission exists - create a placeholder submission with empty answers
      console.log(`Creating placeholder submission for student ${userId} on exam ${examId}`);
      
      // Create empty answers for all questions
      const emptyAnswers = exam.questions.map(question => ({
        questionId: question._id?.toString() || question.id?.toString() || '',
        answer: null
      }));
      
      // Grade the submission (will result in 0 points)
      const { results, totalPointsAwarded, totalPointsPossible } = await gradeSubmission(exam, emptyAnswers);
      
      // Create a placeholder submission ONLY for retake permission tracking
      // IMPORTANT: Mark it as isPlaceholder: true so it doesn't appear in exam history
      // This submission is used to store retake permissions but should NOT be shown to students
      // It will only appear in history if the student actually takes the exam (then isPlaceholder will be false)
      submission = new Submission({
        examId: examId,
        courseId: exam.courseId,
        userId: userId,
        results: results,
        totalPointsAwarded: totalPointsAwarded,
        totalPointsPossible: totalPointsPossible,
        submittedAt: new Date(),
        attemptNumber: 1,
        isRetakeAllowed: false, // Will be set to true below
        maxAttempts: maxAttempts || 2,
        flagged: false, // New submissions are not flagged
        isPlaceholder: true, // CRITICAL: Mark as placeholder so it doesn't appear in history
      });
      
      await submission.save();
      console.log(`✅ Created placeholder submission ${submission._id} (isPlaceholder: true - will NOT appear in history)`);
    } else {
      // Use the most recent submission (sorted by submittedAt)
      submission = submissions[0];
      console.log(`📋 Found ${submissions.length} submission(s). Using most recent: ${submission._id}, submittedAt: ${submission.submittedAt}, flagged: ${submission.flagged}, isRetakeAllowed: ${submission.isRetakeAllowed}`);
    }
    
    // Validate maxAttempts if provided
    if (maxAttempts && maxAttempts <= submission.attemptNumber) {
      return res.status(400).json({ 
        message: `Maximum attempts (${maxAttempts}) must be greater than current attempt number (${submission.attemptNumber})` 
      });
    }
    
    // IMPORTANT: Keep flagged status when granting retake
    // The frontend already supports retakes even when flagged: true (it only checks isRetakeAllowed)
    // This prevents creating problematic unflagged 0% submissions that need cleanup later
    const wasFlagged = submission.flagged === true;
    
    // Update the specific submission to allow retake
    // NOTE: We do NOT unflag invalidated submissions - they should remain flagged in history
    // The frontend will allow retakes based on isRetakeAllowed, not flagged status
    // NOTE: isPlaceholder remains as-is (true if placeholder, false if real submission)
    // Placeholder submissions stay as placeholders until the student actually takes the exam
    const updateFields = {
      isRetakeAllowed: true,
      retakeAllowedAt: new Date(),
      retakeAllowedBy: req.user.id || req.user._id,
      // Keep flagged status - don't unflag invalidated submissions
      // This prevents creating duplicate non-invalidated 0% submissions
      retakeGrantedDespitePreviousFlag: wasFlagged // Track if this was previously flagged
    };
    
    if (maxAttempts) {
      updateFields.maxAttempts = maxAttempts;
    }
    
    const updatedSubmission = await Submission.findByIdAndUpdate(
      submission._id,
      updateFields,
      { new: true, runValidators: false }
    ).populate('examId userId');
    
    // NOTE: We do NOT unflag other submissions when granting retake
    // Invalidated submissions should remain flagged in history to show they were invalidated
    // The frontend allows retakes based on isRetakeAllowed, not flagged status
    // This prevents creating duplicate non-invalidated 0% submissions that need cleanup
    
    console.log(`✅ Granted retake permission for student ${userId} on exam ${examId}. Submission ID: ${submission._id}, Previously flagged: ${wasFlagged}, Now flagged: ${updatedSubmission.flagged}, isRetakeAllowed: ${updatedSubmission.isRetakeAllowed}`);
    
    // Log the action to activity logs - clear message for lecturer action
    const lecturerName = req.user.name || req.user.username || 'Lecturer';
    const log = new SystemLogs({
      userId: req.user.id || req.user._id,
      userName: lecturerName,
      examId: updatedSubmission.examId._id,
      type: 'submission_updated', // This is in activityTypes array
      message: `${lecturerName} granted retake exam to ${updatedSubmission.userId.name}`,
      details: JSON.stringify({
        submissionId: updatedSubmission._id,
        studentName: updatedSubmission.userId.name,
        examTitle: updatedSubmission.examId.title,
        action: 'retake_granted',
        lecturerName: lecturerName
      }),
      timestamp: new Date(),
    });
    
    await log.save();
    
    res.json({
      message: 'Retake allowed successfully',
      submission: updatedSubmission.toJSON(),
      submissionCreated: submissions.length === 0
    });
    
  } catch (error) {
    console.error('Error allowing retake for student:', error);
    res.status(500).json({ message: 'Server error', details: error.message });
  }
};

// @desc    Revoke retake for a submission
// @route   PUT /api/submissions/:id/revoke-retake
// @access  Private/Lecturer
const revokeRetake = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate submission ID
    if (!id) {
      return res.status(400).json({ message: 'Submission ID is required' });
    }

    // Validate MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.error(`❌ Invalid submission ID format: ${id}`);
      return res.status(400).json({ message: 'Invalid submission ID format' });
    }

    console.log(`🔍 Revoking retake for submission ID: ${id}`);

    // Find the submission by ID
    let submission = await Submission.findById(id).populate('examId userId');
    
    // If submission not found by ID, try to find it by userId and examId from request body
    // This handles the case where the submission was deleted by cleanup but retake permission is still active
    if (!submission) {
      console.log(`⚠️ Submission ${id} not found by ID. Attempting to find by userId and examId...`);
      
      // Get userId and examId from request body (sent by frontend as fallback)
      const { userId, examId } = req.body;
      
      if (userId && examId) {
        console.log(`  🔍 Searching for submission with userId: ${userId}, examId: ${examId}`);
        
        // Find all submissions for this user/exam
        const submissions = await Submission.find({ userId, examId })
          .populate('examId userId')
          .sort({ submittedAt: -1 });
        
        console.log(`  📋 Found ${submissions.length} submission(s) for user ${userId} and exam ${examId}`);
        
        // Find the submission with retake permission (most recent one with isRetakeAllowed: true)
        submission = submissions.find(sub => Boolean(sub.isRetakeAllowed) === true);
        
        if (submission) {
          console.log(`✅ Found submission ${submission._id} with retake permission (was looking for ${id})`);
        } else {
          // If no submission with retake permission, try to find the most recent one
          if (submissions.length > 0) {
            submission = submissions[0];
            console.log(`⚠️ No submission with retake permission found. Using most recent submission: ${submission._id}`);
          } else {
            console.error(`❌ No submissions found for user ${userId} and exam ${examId}`);
          }
        }
      } else {
        console.error(`❌ Submission ${id} not found and no userId/examId provided in request body`);
      }
    }
    
    if (!submission) {
      console.error(`❌ Submission not found: ${id}`);
      return res.status(404).json({ 
        message: 'Submission not found. The submission may have been deleted. Please refresh and try again.' 
      });
    }

    console.log(`✅ Found submission: ${submission._id} for user: ${submission.userId?.name || submission.userId}, exam: ${submission.examId?.title || submission.examId}`);

    // Update submission to revoke retake using findByIdAndUpdate to avoid validation issues
    // Use submission._id (found submission) instead of id (request param) in case submission was found by userId/examId
    const updatedSubmission = await Submission.findByIdAndUpdate(
      submission._id,
      {
        isRetakeAllowed: false,
        retakeRevokedAt: new Date(),
        retakeRevokedBy: req.user.id || req.user._id
      },
      { new: true, runValidators: false } // Skip validation to avoid issues with existing data
    ).populate('examId userId');
    
    if (!updatedSubmission) {
      console.error(`❌ Failed to update submission ${submission._id}`);
      return res.status(500).json({ message: 'Failed to revoke retake permission' });
    }

    // Log the action to activity logs - clear message for lecturer action
    const lecturerName = req.user.name || req.user.username || 'Lecturer';
    const log = new SystemLogs({
      userId: req.user.id || req.user._id,
      userName: lecturerName,
      examId: updatedSubmission.examId._id,
      type: 'submission_updated', // This is in activityTypes array
      message: `${lecturerName} revoked retake exam for ${updatedSubmission.userId.name}`,
      details: JSON.stringify({
        submissionId: updatedSubmission._id,
        studentName: updatedSubmission.userId.name,
        examTitle: updatedSubmission.examId.title,
        action: 'retake_revoked',
        lecturerName: lecturerName
      }),
      timestamp: new Date(),
    });
    
    await log.save();
    
    res.json({
      message: 'Retake revoked successfully',
      submission: updatedSubmission.toJSON() // Return the complete submission object
    });
    
  } catch (error) {
    console.error('Error revoking retake:', error);
    res.status(500).json({ message: 'Server error', details: error.message });
  }
};

// @desc    Start an exam session (for tracking active sessions)
// @route   POST /api/submissions/start-session
// @access  Private/Student
const startExamSession = async (req, res) => {
  try {
    const { examId } = req.body;
    
    // Validate examId
    if (!examId) {
      console.error('❌ startExamSession: Missing examId in request body');
      return res.status(400).json({ message: 'Exam ID is required' });
    }
    
    // Validate userId
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      console.error('❌ startExamSession: Missing userId. req.user:', req.user);
      return res.status(400).json({ message: 'User authentication required' });
    }
    
    console.log('✅ startExamSession: userId:', userId, 'examId:', examId);
    
    // Verify exam exists and is available
    const exam = await Exam.findById(examId);
    if (!exam) {
      console.error('❌ startExamSession: Exam not found:', examId);
      return res.status(404).json({ message: 'Exam not found' });
    }
    
    const now = new Date();
    
    // Check if student has retake permission - if so, skip availability date checks
    let hasRetakePermission = false;
    try {
      const existingSubmissions = await Submission.find({ 
        examId, 
        userId 
      }).sort({ attemptNumber: -1 }).limit(1);
      
      if (existingSubmissions.length > 0 && existingSubmissions[0].isRetakeAllowed) {
        hasRetakePermission = true;
        console.log('✅ Student has retake permission, skipping availability date checks');
      }
    } catch (retakeCheckError) {
      console.warn('Warning checking retake permission:', retakeCheckError);
      // Continue with normal availability checks if retake check fails
    }
    
    // Only check availability dates if student doesn't have retake permission
    if (!hasRetakePermission) {
      if (exam.availableFrom && now < new Date(exam.availableFrom)) {
        console.error('❌ startExamSession: Exam not yet available. Available from:', exam.availableFrom);
        return res.status(400).json({ message: 'Exam not yet available' });
      }
      
      if (exam.availableUntil && now > new Date(exam.availableUntil)) {
        console.error('❌ startExamSession: Exam no longer available. Available until:', exam.availableUntil);
        return res.status(400).json({ message: 'Exam no longer available' });
      }
    } else {
      console.log('✅ Retake exam - availability date restrictions bypassed');
    }
    
    // CRITICAL: When student explicitly clicks "Start Exam", ALWAYS create a FRESH session
    // Do NOT resume old sessions - this ensures clean start with 0 violations and correct startTime
    // Resume logic should only apply to automatic reconnections (heartbeats), not explicit starts
    
    // First, mark ALL existing active/flagged sessions as abandoned (clean slate for new start)
    try {
      const abandonedCount = await LiveExamSession.updateMany(
        {
          userId,
          examId: exam._id,
          status: { $in: ['active', 'flagged'] }
        },
        {
          $set: { status: 'abandoned' }
        }
      );
      if (abandonedCount.modifiedCount > 0) {
        console.log('✅ Marked', abandonedCount.modifiedCount, 'old session(s) as abandoned (student starting fresh exam)');
      }
    } catch (cleanupError) {
      console.warn('Warning cleaning up old sessions:', cleanupError);
    }
    
    // ALWAYS create a NEW session when student explicitly starts exam
    // This ensures: fresh startTime, 0 violations, active status, 0 progress
    let session = new LiveExamSession({
      userId,
      examId: exam._id,
      startTime: now, // CRITICAL: Fresh start time (current time)
      lastHeartbeat: now,
      progressCurrent: 0, // CRITICAL: Fresh progress (start at question 0)
      progressTotal: exam.questionCount || 0,
      violationsCount: 0, // CRITICAL: Reset violations to 0 for new session
      status: 'active', // CRITICAL: Always start as 'active', not 'flagged'
      ipAddress: req.ip || req.connection?.remoteAddress || 'Unknown',
      userAgent: req.get('User-Agent') || 'Unknown'
    });
    await session.save();
    const isNewSession = true;
    console.log('✅ Created FRESH exam session (explicit start):', {
      sessionId: session._id,
      startTime: now.toISOString(),
      violationsCount: 0,
      status: 'active',
      progress: '0/' + exam.questionCount
    });
    
    // OLD CODE REMOVED - Resume logic should only apply to heartbeats, not explicit starts
    // The following code was removed because it was resuming old sessions:
    /*
    if (session) {
      // Existing active session found - check if it's recent enough to resume
      const timeSinceLastHeartbeat = now.getTime() - new Date(session.lastHeartbeat).getTime();
      
      if (timeSinceLastHeartbeat < recentSessionWindowMs) {
        // Recent session - RESUME it (update heartbeat, don't create duplicate)
        session.lastHeartbeat = now;
        // CRITICAL: Don't reset status to 'active' if it was flagged - preserve flagged status
        // Only update status if it was abandoned/expired (shouldn't happen, but safety check)
        if (session.status === 'abandoned' || session.status === 'expired') {
          session.status = 'active';
        }
        // Keep existing violationsCount, progress, startTime - this is a resume, not a restart
        await session.save();
        console.log('✅ RESUMED existing exam session:', session._id, 'status:', session.status, 'violations:', session.violationsCount, '(not creating duplicate)');
      } else {
        // Old session - mark as abandoned and create new one
        session.status = 'abandoned';
        await session.save();
        console.log('✅ Marked old session as abandoned (inactive for', Math.floor(timeSinceLastHeartbeat / 60000), 'minutes)');
        
        // Create new session with fresh counters
        session = new LiveExamSession({
          userId,
          examId: exam._id,
          startTime: now, // Fresh start time
          lastHeartbeat: now,
          progressCurrent: 0, // Fresh progress
          progressTotal: exam.questionCount || 0,
          violationsCount: 0, // CRITICAL: Reset violations to 0 for new session
          status: 'active',
          ipAddress: req.ip || req.connection?.remoteAddress || 'Unknown',
          userAgent: req.get('User-Agent') || 'Unknown'
        });
        await session.save();
        isNewSession = true;
        console.log('✅ Created NEW exam session (old one was abandoned):', session._id, 'startTime:', now, 'violationsCount: 0');
      }
    } else {
      // No existing active session - create new one
      // First, mark any old abandoned/expired sessions to keep DB clean
      try {
        await LiveExamSession.updateMany(
          {
            userId,
            examId: exam._id,
            status: { $in: ['active', 'flagged'] } // Shouldn't find any, but just in case
          },
          {
            $set: { status: 'abandoned' }
          }
        );
      } catch (cleanupError) {
        console.warn('Warning cleaning up old sessions:', cleanupError);
      }
      
      session = new LiveExamSession({
        userId,
        examId: exam._id,
        startTime: now, // Fresh start time
        lastHeartbeat: now,
        progressCurrent: 0, // Fresh progress
        progressTotal: exam.questionCount || 0,
        violationsCount: 0, // CRITICAL: Reset violations to 0 for new session
        status: 'active',
        ipAddress: req.ip || req.connection?.remoteAddress || 'Unknown',
        userAgent: req.get('User-Agent') || 'Unknown'
      });
      await session.save();
      isNewSession = true;
      console.log('✅ Created NEW exam session (no existing session):', session._id, 'startTime:', now, 'violationsCount: 0');
    }
    */
    
    // Emit WebSocket event - always 'created' since we always create fresh sessions
    try {
      const io = getIO();
      if (io) {
        const user = await User.findById(userId).select('name username').lean();
        // CRITICAL: Calculate time remaining based on ACTUAL session startTime
        // Use Math.round for accurate display
        const examDuration = exam.durationMinutes || 120;
        const elapsedMs = now.getTime() - new Date(session.startTime).getTime();
        const timeRemainingMs = Math.max(0, examDuration * 60000 - elapsedMs);
        const timeRemainingMinutes = Math.round(timeRemainingMs / 60000);
        
        const payload = {
          sessionId: session._id.toString(),
          userId: userId.toString(),
          userName: user?.name || req.user?.name || req.user?.username || 'Unknown',
          examId: exam._id.toString(),
          examTitle: exam.title,
          examDuration: exam.durationMinutes || 120, // Send exam duration for frontend calculation
          startTime: session.startTime, // CRITICAL: Always send actual startTime from database
          timeRemaining: timeRemainingMinutes, // Send in minutes (rounded for accuracy)
          violationCount: session.violationsCount || 0, // Use actual count (0 for new, preserved for resumed)
          status: session.status,
          currentQuestion: session.progressCurrent || 0, // Ensure progress is included
          totalQuestions: session.progressTotal || exam.questionCount || 0, // Ensure total is included
          lastActivity: session.lastHeartbeat,
        };
        
        // Always emit 'created' event since we always create fresh sessions on explicit start
        io.to(`exam_${exam._id}`).emit('live_session_created', payload);
        io.to('monitoring_all').emit('live_session_created', payload);
        console.log('📤 Emitted live_session_created (fresh session):', {
          sessionId: payload.sessionId,
          studentName: payload.userName,
          startTime: payload.startTime,
          violations: payload.violationCount,
          status: payload.status
        });
      }
    } catch (emitError) {
      console.warn('⚠️ Failed to emit WebSocket event:', emitError);
      // Don't fail the request if emit fails
    }
    
    const sessionIdString = session._id.toString();
    
    // Create exam_start log ONLY if this is a new session
    // Use strict deduplication to prevent duplicate logs when endpoint is called multiple times
    try {
      if (isNewSession) {
        // CRITICAL: Check if exam_start log already exists for this user+exam within last 5 seconds
        // This prevents duplicates when the endpoint is called multiple times rapidly
        // We check by userId + examId (not sessionId) because each call creates a new session
        const fiveSecondsAgo = new Date(now.getTime() - 5 * 1000);
        const existingLog = await SystemLogs.findOne({
          type: 'exam_start',
          userId: userId,
          timestamp: { $gte: fiveSecondsAgo },
          $or: [
            { examId: exam._id.toString() }, // Direct examId match
            { 'details.examId': exam._id.toString() }, // Object format in details
            { details: { $regex: exam._id.toString() } } // JSON string format in details
          ]
        }).lean();
        
        // Only create if no recent log found for this user+exam combination
        if (!existingLog) {
          await SystemLogs.create({
            userId: userId,
            userName: req.user.name || req.user.username,
            type: 'exam_start',
            level: 'info',
            message: `${req.user.name || req.user.username} started ${exam.title}`,
            details: JSON.stringify({
              examId: exam._id.toString(),
              examTitle: exam.title,
              studentId: userId.toString(),
              studentName: req.user.name || req.user.username,
              sessionId: sessionIdString // Include sessionId to track per-session logs
            }),
            examId: exam._id, // Also store examId at top level for easier querying
            timestamp: now,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
          });
          console.log('✅ Exam start log created for userId:', userId, 'examId:', exam._id, 'sessionId:', sessionIdString);
        } else {
          console.log('⚠️ Exam start log already exists for userId:', userId, 'examId:', exam._id, 'within last 5 seconds - skipping duplicate');
        }
      } else {
        console.log('✅ Session already existed - skipping exam_start log (preventing duplicate)');
      }
    } catch (logError) {
      // Non-blocking: log creation failure shouldn't prevent session start
      console.error('❌ Failed to create exam_start log:', logError);
    }
    
    // CRITICAL: Always return the ACTUAL session startTime (even for resumed sessions)
    // This ensures the student timer matches the real exam time, not a reset timer
    res.json({
      message: isNewSession ? 'Exam session started' : 'Exam session resumed',
      examId,
      sessionId: session._id.toString(),
      startTime: session.startTime, // ACTUAL startTime from database (preserved for resumed sessions)
      durationMinutes: exam.durationMinutes,
      progressTotal: session.progressTotal,
      isResumed: !isNewSession // Indicate if this is a resumed session
    });
    
  } catch (error) {
    console.error('Error starting exam session:', error);
    res.status(500).json({ message: 'Server error', details: error.message });
  }
};

// @desc    Get active live exam sessions
// @route   GET /api/submissions/active-sessions
// @access  Private/Admin/Lecturer
const getLiveMonitoringSessions = async (req, res) => {
  try {
    const now = new Date();
    const sessionTimeoutMs = 15 * 60 * 1000; // 15 minutes
    
    // Get active sessions
    const activeSessions = await LiveExamSession.find({
      status: { $in: ['active', 'flagged'] },
      lastHeartbeat: { $gte: new Date(now.getTime() - sessionTimeoutMs) }
    })
      .populate('userId', 'name username')
      .populate('examId', 'title durationMinutes questionCount')
      .sort({ lastHeartbeat: -1 });
    
    // CRITICAL: Return session data with both progressCurrent/progressTotal AND currentQuestion/totalQuestions
    // This ensures compatibility with both WebSocket payload format and API response format
    res.json(activeSessions.map(session => {
      const now = new Date();
      const examDuration = session.examId?.durationMinutes || 120;
      const elapsedMs = now.getTime() - new Date(session.startTime).getTime();
      const timeRemainingMs = Math.max(0, examDuration * 60000 - elapsedMs);
      const timeRemainingMinutes = Math.round(timeRemainingMs / 60000);
      
      return {
        sessionId: session._id.toString(), // Use sessionId for consistency with WebSocket
        id: session._id.toString(), // Also include id for backward compatibility
        userId: session.userId?._id || session.userId,
        userName: session.userId?.name || 'Unknown',
        examId: session.examId?._id || session.examId,
        examTitle: session.examId?.title || 'Unknown',
        startTime: session.startTime,
        lastHeartbeat: session.lastHeartbeat,
        status: session.status,
        progressCurrent: session.progressCurrent !== undefined && session.progressCurrent !== null ? session.progressCurrent : 0,
        progressTotal: session.progressTotal !== undefined && session.progressTotal !== null ? session.progressTotal : 0,
        // Also include currentQuestion/totalQuestions for WebSocket compatibility
        currentQuestion: session.progressCurrent !== undefined && session.progressCurrent !== null ? session.progressCurrent : 0,
        totalQuestions: session.progressTotal !== undefined && session.progressTotal !== null ? session.progressTotal : 0,
        timeRemaining: timeRemainingMinutes,
        violationCount: session.violationsCount || 0
      };
    }));
  } catch (error) {
    console.error('Error getting live sessions:', error);
    res.status(500).json({ message: 'Server error', details: error.message });
  }
};

// @desc    Record a violation during an exam
// @route   POST /api/monitoring/violations
// @access  Private/Student
const recordViolation = async (req, res) => {
  try {
    const { violation, sessionId, examId, totalViolations } = req.body;
    const userId = req.user?.id || req.user?._id;
    const userRole = req.user?.role;
    const userName = req.user?.name || req.user?.username || 'Unknown';

    // CRITICAL: Prevent violations from being logged for admin/lecturer users
    // Only students should have violations during exams
    if (!userId || userRole === 'admin' || userRole === 'lecturer') {
      console.warn('⚠️ Violation attempt by non-student user:', { userId, userRole, userName });
      return res.status(403).json({ 
        success: false, 
        message: 'Violations can only be recorded for student users' 
      });
    }

    if (!violation) {
      return res.status(400).json({ 
        success: false, 
        message: 'Violation data is required' 
      });
    }

    // CRITICAL: Validate examId is provided and valid
    if (!examId) {
      console.warn('⚠️ Violation recorded without examId:', { userId, userName, violation: violation.type });
      return res.status(400).json({ 
        success: false, 
        message: 'Exam ID is required for violation recording' 
      });
    }

    // Get exam details - CRITICAL: Must fetch exam to validate it exists
    let exam = null;
    let examTitle = 'Unknown Exam';
    try {
      exam = await Exam.findById(examId).select('title');
      if (!exam) {
        console.warn('⚠️ Violation recorded for non-existent exam:', { examId, userId, userName });
        return res.status(404).json({ 
          success: false, 
          message: 'Exam not found' 
        });
      }
      examTitle = exam.title;
    } catch (examError) {
      console.error('❌ Error fetching exam for violation:', examError);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to validate exam' 
      });
    }

    // CRITICAL: Violations are ACTIVITY LOGS (student behavior during exams), NOT SystemLogs
    // SystemLogs = Security/System events (server errors, admin actions, suspicious activity)
    // Activity Logs = User activity (violations, exam actions, login/logout)
    // 
    // Violations should:
    // 1. Be tracked in LiveExamSession.violationsCount (for real-time monitoring)
    // 2. Appear in Activity Logs (via consolidatedLogger middleware)
    // 3. NOT be saved to SystemLogs database (they're not security events)
    //
    // The consolidatedLogger middleware will automatically log violations to Activity Logs
    // based on the API endpoint and request type, without flooding SystemLogs
    
    const violationType = violation.type || 'unknown';
    const violationMessage = violation.details || violation.message || 'Violation detected';
    const violationSeverity = violation.severity || 'medium';
    
    // Log to console for debugging (not to SystemLogs database)
    console.log('📝 Violation (Activity Log - not SystemLogs):', {
      type: violationType,
      severity: violationSeverity,
      message: violationMessage.substring(0, 50),
      userId: userId,
      examId: examId,
      sessionId: sessionId
    });
    
    // Note: Violations are tracked in LiveExamSession.violationsCount for real-time monitoring
    // They will appear in Activity Logs via the consolidatedLogger middleware
    // DO NOT save to SystemLogs - they are routine student activity, not security events

    // Update LiveExamSession if sessionId is provided
    if (sessionId) {
      try {
        // CRITICAL: Find the correct session - prioritize sessionId, then fallback to userId+examId
        // This ensures we update the right session even if sessionId is stale
        let session = null;
        if (mongoose.Types.ObjectId.isValid(sessionId)) {
          // First try to find by sessionId
          session = await LiveExamSession.findById(sessionId);
          
          // If sessionId doesn't exist or is abandoned, find the current active session
          if (!session || (session.status !== 'active' && session.status !== 'flagged')) {
            if (examId && mongoose.Types.ObjectId.isValid(examId) && mongoose.Types.ObjectId.isValid(userId)) {
              session = await LiveExamSession.findOne({
                userId: userId,
                examId: examId,
                status: { $in: ['active', 'flagged'] }
              }).sort({ lastHeartbeat: -1 });
              
              if (session) {
                console.log('⚠️ SessionId not found or inactive, using current active session:', session._id);
              }
            }
          }
        } else {
          // If sessionId is not a valid ObjectId, find by userId and examId
          if (examId && mongoose.Types.ObjectId.isValid(examId) && mongoose.Types.ObjectId.isValid(userId)) {
            session = await LiveExamSession.findOne({
              userId: userId,
              examId: examId,
              status: { $in: ['active', 'flagged'] }
            }).sort({ lastHeartbeat: -1 });
          }
        }
        
        if (session) {
          // CRITICAL: Deduplicate violations - prevent same violation from being counted multiple times
          // Check if a similar violation was just recorded (within last 5 seconds)
          // This prevents duplicate violations from reconnects or rapid-fire events
          const now = new Date();
          const violationType = violation.type || 'unknown';
          const violationDetails = violation.details || violation.message || '';
          
          // CRITICAL: Deduplicate violations - prevent same violation from being counted multiple times
          // Check for recent violations of the same type within a longer window (30 seconds)
          // This prevents duplicates from reconnects, rapid events, or network retries
          const recentViolation = await SystemLogs.findOne({
            userId: userId,
            examId: examId,
            type: 'violation',
            'details.violationType': violationType,
            // Match by violation type and similar message (case-insensitive, partial match)
            $or: [
              { message: { $regex: new RegExp(violationDetails.substring(0, 20), 'i') } },
              { 'details.violationType': violationType }
            ],
            timestamp: { $gte: new Date(now.getTime() - 30000) } // Within last 30 seconds (longer window)
          }).sort({ timestamp: -1 });
          
          if (recentViolation) {
            console.log('⚠️ Duplicate violation detected (within 5s) - not incrementing count:', {
              type: violationType,
              sessionId: session._id,
              existingViolationId: recentViolation._id
            });
            // Still update heartbeat to keep session alive, but don't increment violationsCount
            session.lastHeartbeat = now;
            await session.save();
          } else {
            // New violation - increment count
            session.violationsCount = (session.violationsCount || 0) + 1;
            // CRITICAL: Always update heartbeat when violation occurs to prevent session from disappearing
            session.lastHeartbeat = now;
            
            // Flag session if violations exceed threshold (but preserve if already flagged)
            if (session.violationsCount >= 3 && session.status === 'active') {
              session.status = 'flagged';
            }
            // Don't change status if already flagged - keep it flagged
            
            await session.save();
            console.log('✅ Violation recorded:', {
              type: violationType,
              sessionId: session._id,
              violationsCount: session.violationsCount,
              status: session.status
            });
          }

          // Emit WebSocket update for real-time monitoring
          const io = getIO();
          if (io && examId) {
            // Emit violation event
            io.to(`exam_${examId}`).emit('violation', {
              sessionId: session._id.toString(),
              userId: userId,
              userName: userName,
              violation: violation,
              totalViolations: totalViolations || session.violationsCount
            });
            
            // Also emit live_session_updated to update the session in monitoring dashboard
            const exam = await Exam.findById(examId).select('title durationMinutes').lean();
            // Calculate time remaining in minutes (REAL-TIME)
            const now = new Date();
            // CRITICAL: Calculate time remaining based on ACTUAL session startTime
            // Use Math.round for accurate display
            const examDuration = exam?.durationMinutes || 120;
            const elapsedMs = now.getTime() - new Date(session.startTime).getTime();
            const timeRemainingMs = Math.max(0, examDuration * 60000 - elapsedMs);
            const timeRemainingMinutes = Math.round(timeRemainingMs / 60000);
            
            const payload = {
              sessionId: session._id.toString(),
              userId: userId.toString(),
              userName: userName,
              examId: examId.toString(),
              examTitle: exam?.title || examTitle,
              examDuration: exam?.durationMinutes || 120, // Send exam duration for frontend calculation
              startTime: session.startTime, // CRITICAL: Always send actual startTime from database
              timeRemaining: timeRemainingMinutes, // Send in minutes (rounded for accuracy)
              violationCount: session.violationsCount || 0,
              status: session.status,
              currentQuestion: session.progressCurrent || 0, // Ensure progress is included
              totalQuestions: session.progressTotal || 0, // Ensure total is included
              lastActivity: session.lastHeartbeat,
            };
            io.to(`exam_${examId}`).emit('live_session_updated', payload);
            io.to('monitoring_all').emit('live_session_updated', payload);
            console.log('📤 Emitted live_session_updated (violation) to exam_', examId, 'and monitoring_all');
            
            // Emit alert event for monitoring dashboard
            const alertSeverity = violation.severity === 'critical' ? 'critical' : 
                                 violation.severity === 'high' ? 'high' :
                                 session.violationsCount >= 3 ? 'high' : 'medium';
            const alertPayload = {
              id: `alert-${session._id}`,
              sessionId: session._id.toString(),
              userId: userId.toString(),
              userName: userName,
              examId: examId.toString(),
              examTitle: exam?.title || examTitle,
              type: 'violation',
              message: violation.details || violation.message || `${session.violationsCount} violation(s) detected`,
              severity: alertSeverity,
              timestamp: new Date().toISOString(),
              resolved: false
            };
            io.to(`exam_${examId}`).emit('alert_created', alertPayload);
            io.to('monitoring_all').emit('alert_created', alertPayload);
            console.log('📤 Emitted alert_created to exam_', examId, 'and monitoring_all');
          }
        }
      } catch (sessionError) {
        console.warn('Warning: Could not update session:', sessionError);
        // Don't fail the request if session update fails
      }
    }

    res.json({
      success: true,
      message: 'Violation recorded successfully',
      totalViolations: totalViolations || 1
    });
  } catch (error) {
    console.error('Error recording violation:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to record violation', 
      details: error.message 
    });
  }
};

// @desc    Bulk grade multiple submissions for specific questions
// @route   PUT /api/submissions/bulk-grade
// @access  Private/Admin/Lecturer
const bulkGradeSubmissions = async (req, res) => {
  try {
    const { submissionIds, grades } = req.body;

    if (!submissionIds || !Array.isArray(submissionIds) || submissionIds.length === 0) {
      return res.status(400).json({ message: 'Submission IDs array is required' });
    }

    if (!grades || typeof grades !== 'object' || Object.keys(grades).length === 0) {
      return res.status(400).json({ message: 'Grades object is required' });
    }

    // Convert submission IDs to ObjectIds if needed (Mongoose handles this, but be explicit)
    const validSubmissionIds = submissionIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    
    if (validSubmissionIds.length === 0) {
      return res.status(400).json({ message: 'No valid submission IDs provided' });
    }

    // Find all submissions
    const submissions = await Submission.find({
      _id: { $in: validSubmissionIds }
    }).populate('examId userId');

    if (submissions.length === 0) {
      return res.status(404).json({ message: 'No submissions found' });
    }

    const updatedSubmissions = [];

    // Update each submission
    for (const submission of submissions) {
      try {
        let needsUpdate = false;

        // Update results for each question in grades
        for (const [questionId, points] of Object.entries(grades)) {
          // Find the result that matches this question ID
          // Question can have id field (String) or _id field (ObjectId)
          const result = submission.results?.find(r => {
            if (!r || !r.question) return false;
            // Check multiple possible formats
            const qId = r.question.id || r.question._id?.toString() || String(r.question._id);
            return qId === questionId || String(qId) === String(questionId);
          });

          if (result) {
            // Set lecturer override points
            const pointsValue = Number(points);
            if (!isNaN(pointsValue) && pointsValue >= 0) {
              result.lecturerOverridePoints = pointsValue;
              needsUpdate = true;
            }
          }
        }

        if (needsUpdate) {
          // Recalculate total points awarded
          submission.totalPointsAwarded = submission.results.reduce((sum, result) => {
            const points = result.lecturerOverridePoints !== undefined 
              ? result.lecturerOverridePoints 
              : (result.pointsAwarded || 0);
            return sum + points;
          }, 0);

          // Mark results array as modified so Mongoose detects nested changes
          submission.markModified('results');
          await submission.save();
          updatedSubmissions.push(submission);
        }
      } catch (submissionError) {
        console.error(`Error updating submission ${submission._id}:`, submissionError);
        // Continue with other submissions even if one fails
      }
    }

    // Return updated submissions
    return res.json({
      message: `Successfully updated ${updatedSubmissions.length} submission(s)`,
      updatedSubmissions: updatedSubmissions.map(s => s.toJSON())
    });
  } catch (error) {
    console.error('Error bulk grading submissions:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({ message: 'Server error', details: error.message });
  }
};

// Export all functions
export {
  getSubmissions,
  createSubmission,
  updateSubmission,
  allowRetake,
  allowRetakeForStudent,
  revokeRetake,
  startExamSession,
  getLiveMonitoringSessions,
  getAnalytics,
  recordViolation,
  bulkGradeSubmissions
};
