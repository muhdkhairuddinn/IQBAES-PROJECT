import mongoose from 'mongoose';
import SystemLogs from '../models/SystemLogs.js';
import Exam from '../models/Exam.js';
import User from '../models/User.js';
import Submission from '../models/Submission.js';
import LiveExamSession from '../models/LiveExamSession.js';
import { getIO } from '../socket.js';

// Streamlined monitoring controller with optimized queries and error handling
// CRITICAL: Live monitoring is REAL-TIME via WebSocket and LiveExamSession
// SystemLogs are ONLY for record-keeping, NOT for live monitoring
class MonitoringController {
  // Get live monitoring data - REAL-TIME ONLY, NO LOGS
  // This endpoint reads from LiveExamSession (real-time state), NOT from SystemLogs
  // All live updates come via WebSocket events emitted instantly when actions occur
  async getLiveSessions(req, res) {
    try {
      const now = new Date();

      // Get active exam sessions from LiveExamSession ONLY (real-time source)
      // LIVE MONITORING: Sessions should stay visible as long as they're active/flagged
      // We do NOT filter by heartbeat - heartbeat is just for "last activity" timestamp
      // Sessions only become "expired" when exam time actually runs out, not based on heartbeat
      
      // Only mark sessions as expired if exam time has actually passed
      // Give a 5-minute grace period after exam expires before marking as abandoned
      const gracePeriodMinutes = 5;
      const gracePeriodMs = gracePeriodMinutes * 60 * 1000;
      
      try {
        // Get all active/flagged sessions to check their exam durations
        const sessionsToCheck = await LiveExamSession.find({
          status: { $in: ['active', 'flagged'] }
        })
        .populate('examId', 'durationMinutes')
        .lean();
        
        // Mark sessions as expired only if exam time has actually passed + grace period
        for (const session of sessionsToCheck) {
          const examDuration = session.examId?.durationMinutes || 120; // Default 2 hours
          const examDurationMs = examDuration * 60 * 1000;
          const startTime = new Date(session.startTime);
          const examEndTime = new Date(startTime.getTime() + examDurationMs);
          const gracePeriodEnd = new Date(examEndTime.getTime() + gracePeriodMs);
          
          // Only mark as expired if exam time has passed AND grace period has passed
          if (now > gracePeriodEnd && session.status !== 'submitted') {
            await LiveExamSession.updateOne(
              { _id: session._id },
              { $set: { status: 'expired' } }
            );
          }
        }
        
        // Clean up old submitted/expired/abandoned sessions (older than 1 hour) to keep DB clean
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const deletedCount = await LiveExamSession.deleteMany({
          status: { $in: ['submitted', 'expired', 'abandoned'] },
          lastHeartbeat: { $lt: oneHourAgo }
        }).exec();
        if (deletedCount.deletedCount > 0) {
          console.log(`🧹 Cleaned up ${deletedCount.deletedCount} old completed session(s)`);
        }
      } catch (autoExpireError) {
        console.warn('Warning checking session expiration:', autoExpireError);
      }
      
      // Query for ALL active/flagged sessions - NO heartbeat filtering!
      // This is LIVE monitoring - sessions stay visible until exam time expires or they're submitted
      // CRITICAL: Use aggregation to ensure only ONE session per user-exam pair
      const allActiveSessions = await LiveExamSession.aggregate([
        {
          $match: {
            status: { $in: ['active', 'flagged'] }
          }
        },
        {
          $sort: { lastHeartbeat: -1 } // Most recent first
        },
        {
          $group: {
            _id: {
              userId: '$userId',
              examId: '$examId'
            },
            session: { $first: '$$ROOT' } // Keep only the first (most recent) session per user-exam pair
          }
        },
        {
          $replaceRoot: { newRoot: '$session' } // Restore session document
        }
      ]);
      
      // Populate userId and examId manually since aggregation doesn't support populate
      const populatedSessions = await Promise.all(
        allActiveSessions.map(async (session) => {
          const [user, exam] = await Promise.all([
            User.findById(session.userId).select('name username').lean(),
            Exam.findById(session.examId).select('title durationMinutes questionCount').lean()
          ]);
          return {
            ...session,
            userId: user,
            examId: exam
          };
        })
      );
      
      // Aggregation already deduplicated - no need for additional deduplication
      // But we still need to ensure only one session per user-exam pair (safety check)
      const sessionMap = new Map();
      for (const session of populatedSessions) {
        const userIdStr = session.userId?._id?.toString?.() || (typeof session.userId === 'string' ? session.userId : '');
        const examIdStr = session.examId?._id?.toString?.() || (typeof session.examId === 'string' ? session.examId : '');
        const key = `${userIdStr}-${examIdStr}`;
        
        // Aggregation should have already deduplicated, but add safety check
        if (!sessionMap.has(key)) {
          sessionMap.set(key, session);
        } else {
          // This shouldn't happen, but if it does, keep the most recent
          const existing = sessionMap.get(key);
          const sessionTime = new Date(session.lastHeartbeat).getTime();
          const existingTime = new Date(existing.lastHeartbeat).getTime();
          if (sessionTime > existingTime || (sessionTime === existingTime && session.status === 'flagged')) {
            sessionMap.set(key, session);
          }
        }
      }
      
      const activeSessions = Array.from(sessionMap.values());
      
      // Get exams for duration mapping
      const exams = await Exam.find({}, 'title _id durationMinutes').lean();

      const examIdToDuration = new Map(exams.map(e => [e._id.toString(), e.durationMinutes]));

      // Build session payloads from LiveExamSession source (REAL-TIME)
      // This shows ALL students immediately when they start exams, not just after violations
      const processedSessions = activeSessions.map(s => {
        const userIdStr = s.userId?._id?.toString?.() || (typeof s.userId === 'string' ? s.userId : '');
        const userNameStr = s.userId?.name || s.userId?.username || 'Unknown Student';
        const examIdStr = s.examId?._id?.toString?.() || (typeof s.examId === 'string' ? s.examId : '');
        const examTitleStr = s.examId?.title || 'Unknown Exam';
        const durationMin = s.examId?.durationMinutes ?? 120;
        // CRITICAL: Use ACTUAL session startTime from database (preserved for resumed sessions)
        // This ensures the timer reflects the real exam time, not a reset timer
        const sessionStartTime = new Date(s.startTime);
        const elapsedMs = now.getTime() - sessionStartTime.getTime();
        const timeRemainingMs = Math.max(0, durationMin * 60000 - elapsedMs);
        // Preserve actual status from database - don't override 'flagged' or 'active'
        // Only set to 'completed' if time has actually expired and status wasn't explicitly set
        const status = s.status === 'flagged' ? 'flagged' : 
                       (s.status === 'active' && timeRemainingMs > 0 ? 'active' : 
                        (timeRemainingMs <= 0 ? 'completed' : s.status));

        return {
          sessionId: s._id?.toString?.() || `${userIdStr}-${examIdStr}`,
          userId: userIdStr,
          userName: userNameStr,
          examId: examIdStr,
          examTitle: examTitleStr,
          startTime: s.startTime, // ACTUAL startTime from database (preserved for resumed sessions)
          timeRemaining: Math.round(timeRemainingMs / 60000), // Round for more accurate display
          violationCount: s.violationsCount || 0,
          ipAddress: s.ipAddress || 'Unknown',
          userAgent: s.userAgent || 'Unknown',
          lastActivity: s.lastHeartbeat || s.startTime,
          lastHeartbeat: s.lastHeartbeat,
          currentQuestion: s.progressCurrent || 0,
          totalQuestions: s.progressTotal || (s.examId?.questionCount || 0),
          status,
          resolvedAlertIds: s.resolvedAlertIds || [] // Include resolved alerts for filtering
        };
      });

      // CRITICAL: Generate REAL-TIME alerts from live sessions (NOT from logs)
      // Alerts are generated from current LiveExamSession state (violations, status)
      // SystemLogs are only used for record-keeping - live monitoring uses WebSocket + LiveExamSession
      const self = this;
      const liveAlerts = processedSessions
        .filter(session => {
          // Only create alerts for sessions with violations or flagged status
          return (session.violationCount > 0 || session.status === 'flagged');
        })
        .map(session => {
          // Determine alert severity based on violation count and session status
          let severity = 'low';
          let message = '';
          
          if (session.status === 'flagged') {
            severity = 'critical';
            message = `Session flagged - ${session.violationCount} violation${session.violationCount !== 1 ? 's' : ''} detected`;
          } else if (session.violationCount >= 5) {
            severity = 'critical';
            message = `${session.violationCount} violations detected - High risk`;
          } else if (session.violationCount >= 3) {
            severity = 'high';
            message = `${session.violationCount} violations detected - Attention required`;
          } else {
            severity = 'medium';
            message = `${session.violationCount} violation${session.violationCount !== 1 ? 's' : ''} detected`;
          }

          // Generate stable alert ID based on sessionId (not timestamp) so resolved alerts stay resolved
          const alertId = `alert-${session.sessionId}`;

          return {
            id: alertId,
            sessionId: session.sessionId,
            userId: session.userId,
            userName: session.userName,
            examId: session.examId,
            examTitle: session.examTitle,
            type: 'violation',
            message: message,
            details: {
              violationCount: session.violationCount,
              status: session.status,
              sessionId: session.sessionId
            },
            timestamp: session.lastActivity || session.startTime,
            severity: severity,
            resolved: session.resolvedAlertIds?.includes(alertId) || false
          };
        })
        .filter(alert => !alert.resolved); // Filter out resolved alerts

      // Return structured response with REAL-TIME data only
      res.json({
        success: true,
        timestamp: now,
        sessions: processedSessions,
        activeSessions: processedSessions, // For backward compatibility
        alerts: liveAlerts,
        stats: {
          totalSessions: processedSessions.length,
          activeSessions: processedSessions.filter(s => s.status === 'active').length,
          flaggedSessions: processedSessions.filter(s => s.status === 'flagged').length,
          totalAlerts: liveAlerts.length,
          criticalAlerts: liveAlerts.filter(a => a.severity === 'critical').length
        }
      });

    } catch (error) {
      console.error('Error fetching live sessions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch live monitoring data',
        message: error.message
      });
    }
  }

// Resolve alert with proper validation
  async resolveAlert(req, res) {
  try {
    const { alertId } = req.body;

    if (!alertId) {
      return res.status(400).json({
        success: false,
        error: 'Alert ID is required'
      });
    }

    // Check if this is a dynamically generated alert ID (from live sessions, not from logs)
    // Dynamic alert IDs have format: "alert-{sessionId}-{timestamp}"
    const isDynamicAlert = typeof alertId === 'string' && alertId.startsWith('alert-') && !mongoose.Types.ObjectId.isValid(alertId);
    
    if (isDynamicAlert) {
      // Dynamic alerts are generated from live sessions
      // Store resolved alert ID in the session to prevent regeneration
      try {
        // Extract sessionId from alert ID (format: "alert-{sessionId}")
        const sessionId = alertId.replace(/^alert-/, '');
        
        if (mongoose.Types.ObjectId.isValid(sessionId)) {
          const session = await LiveExamSession.findById(sessionId);
          if (session) {
            // Add to resolved alerts list if not already present
            if (!session.resolvedAlertIds || !Array.isArray(session.resolvedAlertIds)) {
              session.resolvedAlertIds = [];
            }
            if (!session.resolvedAlertIds.includes(alertId)) {
              session.resolvedAlertIds.push(alertId);
              await session.save();
              console.log('✅ Resolved dynamic alert stored in session:', alertId);
            }
          }
        }
      } catch (resolveError) {
        console.error('Error storing resolved alert:', resolveError);
      }
      
      return res.json({
        success: true,
        message: 'Alert resolved successfully',
        data: {
          alertId,
          resolvedAt: new Date(),
          resolvedBy: req.user?.id || 'system',
          note: 'Dynamic alert resolved - will not appear again'
        }
      });
    }

    // For real log-based alerts, check if it's a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(alertId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid alert ID format'
      });
    }

    // First, get the current alert to check its structure
    const currentAlert = await SystemLogs.findById(alertId);
    if (!currentAlert) {
      return res.status(404).json({
        success: false,
        error: 'Alert not found'
      });
    }

    // Prepare the details object properly
    let updatedDetails;
    if (typeof currentAlert.details === 'string') {
      // If details is a string, convert it to an object
      updatedDetails = {
        originalMessage: currentAlert.details,
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy: req.user?.id || 'system'
      };
    } else if (typeof currentAlert.details === 'object' && currentAlert.details !== null) {
      // If details is already an object, add resolution fields
      updatedDetails = {
        ...currentAlert.details,
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy: req.user?.id || 'system'
      };
    } else {
      // If details is null or undefined, create a new object
      updatedDetails = {
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy: req.user?.id || 'system'
      };
    }

    // Updates the alert in SystemLogs database
    const result = await SystemLogs.findByIdAndUpdate(
      alertId,
      {
        $set: {
          details: updatedDetails, // Adds resolved: true, resolvedAt, resolvedBy
          resolved: true, // Also set top-level resolved flag for consistency
          level: 'info' // Changes level to indicate resolution
        }
      },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Alert not found or could not be updated'
      });
    }

    // Emit alert resolution via WebSocket to the relevant exam room if examId is known
    try {
      const io = getIO();
      const examIdForEmit = (currentAlert.details && currentAlert.details.examId) ? currentAlert.details.examId.toString() : null;
      if (io) {
        const alertResolvedPayload = {
          alertId,
          resolvedAt: updatedDetails.resolvedAt,
          resolvedBy: updatedDetails.resolvedBy,
          examId: examIdForEmit,
        };
        if (examIdForEmit) {
          io.to(`exam_${examIdForEmit}`).emit('alert_resolved', alertResolvedPayload);
        }
        // Also emit to monitoring_all so all dashboards get the update
        io.to('monitoring_all').emit('alert_resolved', alertResolvedPayload);
        console.log('📤 Emitted alert_resolved to monitoring_all');
      }
    } catch (emitErr) {
      console.warn('⚠️ Failed to emit alert_resolved:', emitErr);
      // non-blocking
    }

    res.json({
      success: true,
      message: 'Alert resolved successfully',
      data: {
        alertId,
        resolvedAt: updatedDetails.resolvedAt,
        resolvedBy: updatedDetails.resolvedBy
      }
    });

  } catch (error) {
    console.error('Error resolving alert:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resolve alert',
      message: error.message
    });
  }
}

// Flag session with proper validation and logging
  async flagSession(req, res) {
  try {
    const { sessionId, reason } = req.body;

    if (!sessionId || !reason) {
      return res.status(400).json({
        success: false,
        error: 'Session ID and reason are required'
      });
    }

    let userId, examId, session;

    // Check if sessionId is a MongoDB ObjectId (direct LiveExamSession ID)
    if (mongoose.Types.ObjectId.isValid(sessionId)) {
      // Look up the session directly
      session = await LiveExamSession.findById(sessionId)
        .populate('userId', 'name email')
        .populate('examId', 'title');
      
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }
      
      userId = session.userId?._id?.toString() || (typeof session.userId === 'string' ? session.userId : '');
      examId = session.examId?._id?.toString() || (typeof session.examId === 'string' ? session.examId : '');
    } else {
      // Try to parse as composite format "userId-examId"
      const parts = sessionId.split('-');
      if (parts.length >= 2) {
        userId = parts[0];
        examId = parts.slice(1).join('-'); // In case examId contains dashes
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid session ID format. Expected ObjectId or userId-examId format'
        });
      }
    }

    if (!userId || !examId) {
      return res.status(400).json({
        success: false,
        error: 'Could not extract userId and examId from session ID'
      });
    }

    // Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(examId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid userId or examId format'
      });
    }

    // Get user, exam, and lecturer details
    const [user, exam, lecturer] = await Promise.all([
      User.findById(userId).select('name email'),
      Exam.findById(examId).select('title durationMinutes'), // Include durationMinutes for time calculation
      User.findById(req.user?._id || req.user?.id).select('name email') // Get lecturer info
    ]);

    // Fix: Use req.user._id or req.user.id, with fallback
    const flaggedById = req.user?._id || req.user?.id || 'system';
    const flaggedByName = lecturer?.name || 'System'; // Get lecturer name

    // Create flag log entry
    const flagLog = await SystemLogs.create({
      type: 'session_flagged',
      level: 'warn',
      message: `Session flagged: ${reason}`,
      details: {
        sessionId,
        reason,
        flaggedBy: flaggedByName, // Store lecturer name instead of ID
        flaggedById, // Keep ID for reference
        userId,
        examId,
        userName: user?.name || 'Unknown',
        examTitle: exam?.title || 'Unknown'
      },
      userId,
      userName: user?.name,
      timestamp: new Date()
    });

    // Update any related exam submission
    await Submission.updateMany(
      { userId, examId },
      {
        $set: {
          flagged: true,
          flagReason: reason,
          flaggedAt: new Date(),
          flaggedBy: flaggedByName // Store lecturer name in submission too
        }
      }
    );

    // Update LiveExamSession to flagged and emit update to exam room
    try {
      const now = new Date();
      // Use the session we already found, or look it up
      if (!session) {
        session = await LiveExamSession.findOneAndUpdate(
          { userId, examId, status: { $in: ['active', 'flagged'] } },
          { $set: { status: 'flagged', lastHeartbeat: now } },
          { new: true }
        );
      } else {
        // Update the session we already have
        session.status = 'flagged';
        session.lastHeartbeat = now;
        await session.save();
      }

      const io = getIO();
      if (io && session) {
        // Calculate time remaining in minutes (REAL-TIME)
        const now = new Date();
        const examDuration = exam?.durationMinutes || 120;
        const elapsedMs = now.getTime() - new Date(session.startTime).getTime();
        // CRITICAL: Calculate time remaining based on ACTUAL session startTime
        // Use Math.round for accurate display
        const timeRemainingMs = Math.max(0, examDuration * 60000 - elapsedMs);
        const timeRemainingMinutes = Math.round(timeRemainingMs / 60000);
        
        const payload = {
          sessionId: session._id.toString(),
          userId: userId.toString(),
          userName: user?.name || 'Unknown',
          examId: examId.toString(),
          examTitle: exam?.title || 'Unknown',
          examDuration: exam?.durationMinutes || 120, // Send exam duration for frontend calculation
          startTime: session.startTime, // CRITICAL: Always send actual startTime from database
          timeRemaining: timeRemainingMinutes, // Send in minutes (rounded for accuracy)
          violationCount: session.violationsCount || 0,
          status: session.status,
          currentQuestion: session.progressCurrent || 0, // Ensure progress is included
          totalQuestions: session.progressTotal || 0, // Ensure total is included
          lastActivity: session.lastHeartbeat,
          flagReason: reason,
        };
        io.to(`exam_${payload.examId}`).emit('live_session_updated', payload);
        io.to('monitoring_all').emit('live_session_updated', payload);
        console.log('📤 Emitted live_session_updated (flag) to exam_', payload.examId, 'and monitoring_all');
      } else {
        console.warn('⚠️ Socket.IO not initialized or no session - cannot emit live_session_updated (flag)');
      }
    } catch (emitErr) {
      console.error('❌ Error emitting live_session_updated (flag):', emitErr);
    }

    res.json({
      success: true,
      message: 'Session flagged successfully',
      data: {
        flagLog,
        sessionId,
        reason
      }
    });

  } catch (error) {
    console.error('Error flagging session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to flag session',
      message: error.message
    });
  }
}

// Get violations with pagination and filtering
async getViolations(req, res) {
  try {
    const {
      page = 1,
      limit = 20,
      examId,
      userId,
      severity,
      startDate,
      endDate
    } = req.query;

    // Build query
    const query = { type: 'violation' };

    if (examId) query['details.examId'] = examId;
    if (userId) query.userId = userId;
    if (severity) query.level = severity;

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    // Execute query with pagination
    const [violations, total] = await Promise.all([
      SystemLogs.find(query)
        .sort({ timestamp: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .select({
          _id: 1,
          userId: 1,
          userName: 1,
          message: 1,
          details: 1,
          timestamp: 1,
          level: 1,
          resolved: 1
        })
        .lean(), // Use lean() to get plain JavaScript objects
      SystemLogs.countDocuments(query)
    ]);

    // Get ALL sessions (not just active) to find sessionId for violations
    // Include submitted and expired sessions too, as violations may reference them
    const LiveExamSession = (await import('../models/LiveExamSession.js')).default;
    const allSessions = await LiveExamSession.find({}).lean().exec();
    
    // Create a map of userId-examId -> sessionId for quick lookup
    // Prioritize active/flagged sessions, but include all sessions
    const sessionMap = new Map();
    allSessions.forEach(session => {
      const userIdStr = session.userId?.toString?.() || (typeof session.userId === 'object' ? session.userId._id?.toString() : session.userId);
      const examIdStr = session.examId?.toString?.() || (typeof session.examId === 'object' ? session.examId._id?.toString() : session.examId);
      if (userIdStr && examIdStr) {
        const key = `${userIdStr}-${examIdStr}`;
        // If key already exists, prefer active/flagged sessions over submitted/expired
        if (!sessionMap.has(key)) {
          sessionMap.set(key, session._id.toString());
        } else {
          // If existing session is submitted/expired and new one is active/flagged, replace
          const existingSession = allSessions.find(s => s._id.toString() === sessionMap.get(key));
          if (existingSession && ['submitted', 'expired', 'abandoned'].includes(existingSession.status) && 
              ['active', 'flagged'].includes(session.status)) {
            sessionMap.set(key, session._id.toString());
          }
        }
      }
    });

    // Transform to ensure both _id and id are available, and include sessionId
    const transformedViolations = violations.map(v => {
      // Find sessionId from sessionMap
      const userIdObj = v.userId;
      let userIdStr = '';
      if (userIdObj) {
        if (typeof userIdObj === 'string') {
          userIdStr = userIdObj;
        } else if (typeof userIdObj === 'object' && userIdObj._id) {
          userIdStr = userIdObj._id.toString();
        } else if (typeof userIdObj === 'object' && userIdObj.toString) {
          userIdStr = userIdObj.toString();
        }
      }
      
      let examIdStr = '';
      let details = {};
      try {
        details = typeof v.details === 'string' ? JSON.parse(v.details || '{}') : (v.details || {});
        examIdStr = details.examId || '';
      } catch (e) {
        details = {};
      }
      
      const sessionKey = `${userIdStr}-${examIdStr}`;
      let sessionId = sessionMap.get(sessionKey);
      
      // Fallback: check if sessionId is already in details
      if (!sessionId && details.sessionId) {
        sessionId = details.sessionId;
      }
      
      // Final fallback: check if sessionId is in the log itself (top-level field)
      if (!sessionId && v.sessionId) {
        sessionId = v.sessionId;
      }
      
      // Only use 'unknown' if we truly can't find it
      if (!sessionId) {
        sessionId = 'unknown';
      } else {
        // Update details with found sessionId
        details.sessionId = sessionId;
      }
      
      return {
        ...v,
        id: v._id?.toString() || v._id,
        _id: v._id?.toString() || v._id,
        resolved: v.resolved || false, // Use the actual resolved field from database
        details: details
      };
    });

    res.json({
      success: true,
      data: {
        violations: transformedViolations,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching violations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch violations',
      message: error.message
    });
  }
}

// Helper method to determine alert severity
determineSeverity(violationType, level) {
  const criticalViolations = ['tab_switch', 'window_blur', 'copy_paste', 'right_click'];
  const highViolations = ['suspicious_activity', 'multiple_tabs'];
  
  if (level === 'error' || criticalViolations.includes(violationType)) {
    return 'critical';
  }
  if (level === 'warning' || highViolations.includes(violationType)) {
    return 'high';
  }
  if (level === 'info') {
    return 'medium';
  }
  return 'low';
}

// Heartbeat endpoint for active exam sessions
  async recordHeartbeat(req, res) {
  try {
    const { examId, sessionId, currentQuestion, totalQuestions } = req.body;
    
    // CRITICAL: Log incoming heartbeat data for debugging
    console.log('📥 Received heartbeat:', {
      examId,
      sessionId,
      currentQuestion: currentQuestion !== undefined ? currentQuestion : 'undefined',
      displayQuestion: currentQuestion !== undefined ? currentQuestion + 1 : 'undefined',
      totalQuestions: totalQuestions !== undefined ? totalQuestions : 'undefined'
    });
    // Fix: Use req.user._id or req.user.id with fallback
    const userId = req.user?._id || req.user?.id;
    const userName = req.user?.name;

    // Validate required fields
    if (!userId || !examId) {
      return res.status(400).json({
        success: false,
        error: 'User ID and Exam ID are required'
      });
    }

    // NOTE: exam_start log is created in start-session endpoint, not here
    // This prevents duplicate logs from multiple heartbeats
    // The heartbeat endpoint only updates the session's lastHeartbeat, not creates logs

    // NOTE: Heartbeats are NOT logged to SystemLogs database to avoid clutter
    // Heartbeats are tracked via LiveExamSession.lastHeartbeat field for monitoring
    // Only the exam_start log is created (once per session) - see code above

    // Update LiveExamSession lastHeartbeat AND progress, then notify via WebSocket
    try {
      const lastHeartbeat = new Date();
      const updateFields = { lastHeartbeat };
      
      // CRITICAL: Update progress if provided (real-time question tracking)
      // This ensures progress updates instantly as student moves through questions
      if (typeof currentQuestion === 'number') {
        updateFields.progressCurrent = currentQuestion;
        console.log('📊 Heartbeat: Updating progress to question', currentQuestion, '(0-based index)');
      }
      if (typeof totalQuestions === 'number') {
        updateFields.progressTotal = totalQuestions;
      }
      
      // CRITICAL: Find session by userId and examId (sessionId from client might be stale)
      // This ensures we update the correct session even if client sends wrong sessionId
      const session = await LiveExamSession.findOneAndUpdate(
        { userId, examId, status: { $in: ['active', 'flagged'] } },
        { $set: updateFields },
        { new: true }
      ).populate('examId', 'durationMinutes title');
      
      // CRITICAL: Verify the update actually worked
      if (session && typeof currentQuestion === 'number') {
        // Re-fetch to ensure we have the latest data (sometimes findOneAndUpdate doesn't reflect immediately)
        const verifiedSession = await LiveExamSession.findById(session._id).populate('examId', 'durationMinutes title');
        const actualProgress = verifiedSession?.progressCurrent ?? session.progressCurrent;
        const actualTotal = verifiedSession?.progressTotal ?? session.progressTotal;
        
        console.log('✅ Heartbeat: Session progress updated to', actualProgress + 1, '/', actualTotal, '(display: 1-based)', {
          sessionId: session._id.toString(),
          userId: userId.toString(),
          examId: examId.toString(),
          progressCurrent: actualProgress,
          progressTotal: actualTotal,
          receivedCurrentQuestion: currentQuestion,
          updateFields: updateFields,
          verified: verifiedSession ? 'yes' : 'no'
        });
        
        // Use verified session if available
        if (verifiedSession) {
          Object.assign(session, {
            progressCurrent: verifiedSession.progressCurrent,
            progressTotal: verifiedSession.progressTotal
          });
        }
      } else if (!session) {
        console.warn('⚠️ Heartbeat: No active session found for userId:', userId, 'examId:', examId);
      }

      const io = getIO();
      if (!session) {
        // Check if there's an abandoned session (invalidated)
        const abandonedSession = await LiveExamSession.findOne({
          userId, examId, status: 'abandoned'
        }).sort({ lastHeartbeat: -1 }).lean();
        
        if (abandonedSession) {
          return res.json({
            success: true,
            message: 'Heartbeat recorded (session invalidated)',
            timestamp: new Date().toISOString(),
            sessionStatus: 'abandoned',
            invalidated: true
          });
        }
        
        // This is normal - session might not exist yet if student hasn't started exam
        // Don't log as error, just return success
        return res.json({
          success: true,
          message: 'Heartbeat recorded (no active session found)',
          timestamp: new Date().toISOString()
        });
      }
      
      // Emit WebSocket update if session is still active
      if (io && session.status !== 'abandoned') {
        // Calculate time remaining in minutes (REAL-TIME)
        const now = new Date();
        const examDuration = session.examId?.durationMinutes || 120;
        const elapsedMs = now.getTime() - new Date(session.startTime).getTime();
        // CRITICAL: Calculate time remaining based on ACTUAL session startTime
        // Use Math.round for accurate display (37m instead of 36m if 36.5m remaining)
        const timeRemainingMs = Math.max(0, examDuration * 60000 - elapsedMs);
        const timeRemainingMinutes = Math.round(timeRemainingMs / 60000);
        
        // CRITICAL: Get the UPDATED progress from the VERIFIED session
        // Always use the verified session's progress values (from database) to ensure accuracy
        const currentProgress = session.progressCurrent !== undefined && session.progressCurrent !== null
          ? session.progressCurrent  // Use verified database value
          : (typeof currentQuestion === 'number' ? currentQuestion : 0); // Fallback to received value
        const totalProgress = session.progressTotal !== undefined && session.progressTotal !== null
          ? session.progressTotal  // Use verified database value
          : (typeof totalQuestions === 'number' 
              ? totalQuestions 
              : (session.examId?.questionCount || 0)); // Fallback to received value or exam count
        
        const payload = {
          sessionId: session._id.toString(), // CRITICAL: Use MongoDB sessionId, not client-generated one
          userId: userId.toString(),
          userName: userName || 'Unknown',
          examId: examId.toString(),
          examTitle: session.examId?.title || 'Unknown',
          examDuration: session.examId?.durationMinutes || 120, // Send exam duration for frontend calculation
          startTime: session.startTime, // CRITICAL: Always send actual startTime from database
          timeRemaining: timeRemainingMinutes, // Send in minutes (rounded for accuracy)
          violationCount: session.violationsCount || 0,
          status: session.status,
          currentQuestion: currentProgress, // CRITICAL: Send UPDATED progress (0-based index)
          totalQuestions: totalProgress, // CRITICAL: Send UPDATED total
          lastActivity: session.lastHeartbeat,
        };
        io.to(`exam_${payload.examId}`).emit('live_session_updated', payload);
        io.to('monitoring_all').emit('live_session_updated', payload);
        console.log('📤 Emitted live_session_updated (heartbeat):', {
          sessionId: payload.sessionId,
          studentName: payload.userName,
          progress: `${payload.currentQuestion}/${payload.totalQuestions}`,
          displayProgress: `${payload.currentQuestion + 1}/${payload.totalQuestions}`,
          timeRemaining: `${payload.timeRemaining}m`,
          violations: payload.violationCount,
          status: payload.status,
          receivedCurrentQuestion: currentQuestion, // What we received from client
          receivedTotalQuestions: totalQuestions, // What we received from client
          storedProgressCurrent: session.progressCurrent, // What's stored in database
          storedProgressTotal: session.progressTotal, // What's stored in database
          sendingCurrentQuestion: currentProgress, // What we're sending in WebSocket
          sendingTotalQuestions: totalProgress // What we're sending in WebSocket
        });
      } else if (!io) {
        // Socket.IO not initialized - this is fine, heartbeat still recorded
        console.warn('⚠️ Socket.IO not initialized - heartbeat recorded but not broadcasted');
      }
      
      // Return session status so client can check if it's abandoned
      return res.json({
        success: true,
        message: 'Heartbeat recorded',
        timestamp: new Date().toISOString(),
        sessionStatus: session.status,
        invalidated: session.status === 'abandoned'
      });
    } catch (emitErr) {
      console.error('❌ Error emitting live_session_updated (heartbeat):', emitErr);
      // If emit fails, still return success for heartbeat
      return res.json({
        success: true,
        message: 'Heartbeat recorded (emit failed)',
        timestamp: new Date().toISOString(),
        sessionStatus: 'unknown',
        invalidated: false
      });
    }

  } catch (error) {
    console.error('Error recording heartbeat:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record heartbeat',
      message: error.message
    });
  }
}
// Health check endpoint
async healthCheck(req, res) {
  try {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);

    // Check recent activity
    const recentLogs = await SystemLogs.countDocuments({
      timestamp: { $gte: oneMinuteAgo }
    });

    res.json({
      success: true,
      status: 'healthy',
      timestamp: now,
      metrics: {
        recentLogs,
        uptime: process.uptime()
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
}
}

const monitoringController = new MonitoringController();

// Update the exports at the end of the file

// Export bound methods to preserve 'this' context
export const getLiveSessions = monitoringController.getLiveSessions.bind(monitoringController);
export const resolveAlert = monitoringController.resolveAlert.bind(monitoringController);
export const flagSession = monitoringController.flagSession.bind(monitoringController);
export const getViolations = monitoringController.getViolations.bind(monitoringController);
export const healthCheck = monitoringController.healthCheck.bind(monitoringController);
export const recordHeartbeat = monitoringController.recordHeartbeat.bind(monitoringController);
export default monitoringController;

// Standalone Admin handlers (outside of class) – safe for routing
export const adminInvalidateSession = async (req, res) => {
  try {
    const { sessionId, reason } = req.body;
    if (!sessionId) return res.status(400).json({ success: false, error: 'Session ID is required' });
    const session = await LiveExamSession.findById(sessionId)
      .populate('userId', 'name username')
      .populate('examId', 'title');
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    const userId = (session.userId?._id || session.userId).toString();
    const examId = (session.examId?._id || session.examId).toString();

    session.status = 'abandoned';
    session.lastHeartbeat = new Date();
    await session.save();

    // Get the exam to access questions
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ success: false, error: 'Exam not found' });
    }

    // Find all submissions for this user/exam and sort by submittedAt (most recent first)
    const allSubmissions = await Submission.find({ userId, examId }).sort({ submittedAt: -1 });
    
    console.log(`🔍 Found ${allSubmissions.length} submission(s) for userId: ${userId}, examId: ${examId}`);
    
    // Get the current session start time (if session exists)
    const sessionStartTime = session.startTime ? new Date(session.startTime) : null;
    // CRITICAL: Use new Date() to get the CURRENT date/time (today)
    // This ensures the submission shows today's date in history, not an old date
    const now = new Date();
    
    // Log the current date to verify it's correct
    console.log(`📅 Current date/time: ${now.toISOString()}`);
    console.log(`📅 Current date (local): ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`);
    
    // CRITICAL: We ALWAYS create a NEW submission for each invalidation
    // We NEVER update existing submissions - this ensures each invalidation appears as a separate entry
    // Previous logic that updated existing submissions has been removed to prevent interference
    
    console.log(`🔍 Starting invalidation process:`);
    console.log(`  📋 Session start: ${sessionStartTime ? sessionStartTime.toISOString() : 'N/A'}`);
    console.log(`  📋 Total existing submissions: ${allSubmissions.length}`);
    console.log(`  📋 Already flagged submissions: ${allSubmissions.filter(s => s.flagged).length}`);
    
    // CRITICAL: Always create a NEW submission for EACH invalidation
    // Each invalidation is a separate event and MUST appear as a distinct entry in history
    // Rule: NEVER update existing submissions - ALWAYS create new ones
    // This ensures that if a student is invalidated 2 times, they see 2 invalidated entries (not 1)
    // Example: If a student is invalidated 10 times, they should see 10 separate entries in history
    
    console.log(`  ✅ Will create NEW invalidated submission (not updating existing ones)`);
    console.log(`  ✅ This ensures each invalidation appears as a separate entry in history`);
    
    // Create results with "Cheating is not allowed" for all questions
    const results = exam.questions.map((question) => {
      const questionId = question._id?.toString() || question.id?.toString() || '';
      return {
        question: question.toObject ? question.toObject() : question,
        userAnswer: {
            questionId: questionId,
            answer: 'Cheating is not allowed'
        },
        isCorrect: false,
        pointsAwarded: 0,
        gradingJustification: 'Answer invalidated due to cheating detection. This exam attempt has been disqualified.',
      };
    });
    
    const totalPointsPossible = exam.questions.reduce((acc, q) => acc + (q.points || 0), 0);
    
    let savedSubmission;
    
    // ALWAYS create a NEW submission for each invalidation
    // This ensures that each invalidation appears as a separate entry in history
    // Example: If a student is invalidated 10 times, they will see 10 separate entries
    console.log(`⚠️ Creating NEW invalidated submission for this invalidation event...`);
    console.log(`  📋 Session started at: ${sessionStartTime ? sessionStartTime.toISOString() : 'N/A'}`);
    console.log(`  📋 Creating submission at: ${now.toISOString()} (${now.toLocaleDateString()})`);
    console.log(`  📋 Previous submissions: ${allSubmissions.length} (${allSubmissions.filter(s => s.flagged).length} already flagged)`);
    
    // Determine attempt number (increment from most recent submission)
    // Count all submissions (including flagged ones) to get the correct attempt number
    const attemptNumber = allSubmissions.length > 0 
      ? (allSubmissions[0].attemptNumber || allSubmissions.length) + 1
      : 1;
    
    console.log(`  📋 Attempt number: ${attemptNumber}`);
    console.log(`  📋 This is invalidation #${allSubmissions.filter(s => s.flagged).length + 1} for this user/exam`);
    
    // Create the invalidated submission with CURRENT timestamp
    // Each invalidation gets its own timestamp, so they appear as separate entries
    const currentTimestamp = Date.now();
    const currentDate = new Date(currentTimestamp);
    
    const invalidatedSubmission = new Submission({
      examId: examId,
      courseId: exam.courseId,
      userId: userId,
      results: results,
      totalPointsAwarded: 0,
      totalPointsPossible: totalPointsPossible,
      submittedAt: currentDate, // Current timestamp - each invalidation gets its own date
      attemptNumber: attemptNumber,
      isRetakeAllowed: false,
      maxAttempts: 1,
      flagged: true,
      flagReason: reason || 'Admin invalidated session',
      flaggedAt: currentDate,
      flaggedBy: req.user?.name || 'Admin',
      isPlaceholder: false, // CRITICAL: Invalidated submissions are NOT placeholders - they appear in history
    });
    
    // CRITICAL: Save the new submission to the database
    // This creates a NEW document with a unique _id - it does NOT update an existing one
    savedSubmission = await invalidatedSubmission.save();
    
    // Verify the submission was created (not updated)
    const createdSubmissionId = savedSubmission._id.toString();
    console.log(`✅ SUCCESS: Created NEW invalidated submission ${createdSubmissionId}`);
    console.log(`  📋 Submission ID: ${createdSubmissionId} (this is a NEW document with unique ID)`);
    console.log(`  📋 User ID: ${savedSubmission.userId}`);
    console.log(`  📋 Exam ID: ${savedSubmission.examId}`);
    console.log(`  📋 Submitted at (ISO): ${savedSubmission.submittedAt?.toISOString()}`);
    console.log(`  📋 Submitted at (local): ${savedSubmission.submittedAt?.toLocaleDateString()} ${savedSubmission.submittedAt?.toLocaleTimeString()}`);
    console.log(`  📋 Flagged: ${savedSubmission.flagged} (MUST be true)`);
    console.log(`  📋 Flagged at: ${savedSubmission.flaggedAt?.toISOString()}`);
    console.log(`  📋 Flagged by: ${savedSubmission.flaggedBy}`);
    console.log(`  📋 Is retake allowed: ${savedSubmission.isRetakeAllowed}`);
    console.log(`  📋 Total questions: ${results.length}`);
    console.log(`  📋 Attempt number: ${attemptNumber}`);
    
    // Count total flagged submissions after this creation
    const totalFlaggedAfter = allSubmissions.filter(s => s.flagged).length + 1;
    console.log(`  📋 Total flagged submissions after this: ${totalFlaggedAfter}`);
    console.log(`  📋 This is invalidation #${totalFlaggedAfter} for this user/exam`);
    
    // Verify the submission is actually flagged
    if (!savedSubmission.flagged) {
      console.error(`  ❌ ERROR: Submission ${createdSubmissionId} was created but is NOT flagged!`);
      console.error(`  ❌ This should never happen - the submission must be flagged to appear as invalidated`);
      // Force flag it
      savedSubmission.flagged = true;
      savedSubmission.flagReason = reason || 'Admin invalidated session';
      savedSubmission.flaggedAt = currentDate;
      savedSubmission.flaggedBy = req.user?.name || 'Admin';
      await savedSubmission.save();
      console.error(`  🔧 FIXED: Forced flag on submission ${createdSubmissionId}`);
    }
    
    // Verify the submission was saved correctly
    const verifySubmission = await Submission.findById(savedSubmission._id);
    if (!verifySubmission) {
      console.error(`  ❌ ERROR: Submission ${savedSubmission._id} was not found in database after save!`);
      return res.status(500).json({ success: false, error: 'Failed to create invalidated submission' });
    }
    if (!verifySubmission.flagged) {
      console.error(`  ❌ ERROR: Submission ${savedSubmission._id} exists but is NOT flagged!`);
      // Force flag it
      verifySubmission.flagged = true;
      verifySubmission.flagReason = reason || 'Admin invalidated session';
      verifySubmission.flaggedAt = currentDate;
      verifySubmission.flaggedBy = req.user?.name || 'Admin';
      await verifySubmission.save();
      console.error(`  🔧 FIXED: Forced flag on submission ${savedSubmission._id}`);
    }
    console.log(`  ✅ VERIFIED: Submission ${savedSubmission._id} exists in database and is flagged: ${verifySubmission.flagged}`);
    
    // CRITICAL: Revoke retake permissions on ALL submissions for this user/exam FIRST
    // This ensures that any previously retake-allowed submissions become eligible for cleanup
    // Use updateMany to revoke retakes on all submissions at once
    const revokeRetakeResult = await Submission.updateMany(
      { userId, examId },
            {
              $set: {
          isRetakeAllowed: false,
          retakeRevokedAt: new Date(),
          retakeRevokedBy: req.user?.id || req.user?._id || null
        }
      }
    );
    console.log(`✅ Revoked retake permissions on ${revokeRetakeResult.modifiedCount} submission(s) for userId: ${userId}, examId: ${examId}`);
    
    // Verify that all submissions now have retake revoked
    const verifySubmissions = await Submission.find({ userId, examId });
    const stillHasRetake = verifySubmissions.some(sub => sub.isRetakeAllowed === true);
    if (stillHasRetake) {
      console.error(`⚠️ WARNING: Some submissions still have retake permission after revocation!`);
      verifySubmissions.forEach(sub => {
        console.error(`  - Submission ${sub._id}: isRetakeAllowed=${sub.isRetakeAllowed}, flagged=${sub.flagged}`);
      });
            } else {
      console.log(`✅ Verified: All ${verifySubmissions.length} submission(s) have retake permission revoked`);
    }
    
    // CRITICAL: Clean up ALL duplicate non-invalidated 0% submissions AFTER revoking retake permissions
    // Rule: When an exam is invalidated, delete ALL non-invalidated 0% submissions for the same user/exam
    // This includes placeholders, old attempts, and any other 0% entries that aren't invalidated
    // Only keep: 1) The newly created invalidated submission, 2) Other invalidated submissions, 3) Submissions with scores > 0%
    // This ensures exam history shows only real attempts and invalidations, not redundant placeholders
    // NOTE: We run cleanup AFTER revoking retake permissions so that previously retake-allowed submissions
    // that are non-invalidated 0% submissions can be properly cleaned up
    try {
      // Find ALL submissions for this user/exam (except the newly created invalidated one)
      const allOtherSubmissions = await Submission.find({
        userId,
        examId,
        _id: { $ne: savedSubmission._id } // Exclude the newly created invalidated submission
      });
      
      // Identify duplicates to delete: ALL non-invalidated 0% submissions
      // This includes placeholders and any other 0% entries that aren't invalidated
      // CRITICAL: Delete ALL non-invalidated 0% submissions to prevent duplicates in history
      // Since we've already revoked retake permissions, we don't need to check isRetakeAllowed anymore
      const duplicatesToDelete = allOtherSubmissions.filter(sub => {
        const isFlagged = Boolean(sub.flagged) === true;
        const isZeroScore = (sub.totalPointsAwarded || 0) === 0;
        // Delete if: not flagged AND 0% score
        // This includes placeholders and any other 0% entries that aren't invalidated
        return !isFlagged && isZeroScore;
      });
      
      if (duplicatesToDelete.length > 0) {
        console.log(`🧹 Found ${duplicatesToDelete.length} duplicate non-invalidated 0% submission(s) to clean up:`);
        duplicatesToDelete.forEach(sub => {
          console.log(`  🗑️ Will delete: ${sub._id} (submittedAt: ${sub.submittedAt?.toLocaleDateString()}, flagged: ${sub.flagged}, isPlaceholder: ${sub.isPlaceholder || false}, score: ${sub.totalPointsAwarded}%)`);
        });
        
        // CRITICAL: Double-check that we're NOT deleting any invalidated submissions
        // Verify that all duplicatesToDelete are NOT flagged
        const flaggedInDeletes = duplicatesToDelete.filter(sub => Boolean(sub.flagged) === true);
        
        if (flaggedInDeletes.length > 0) {
          console.error(`❌ ERROR: Found ${flaggedInDeletes.length} flagged submission(s) in duplicates to delete!`);
          console.error(`❌ This should NEVER happen - invalidated submissions should NOT be deleted!`);
          
          flaggedInDeletes.forEach(sub => {
            console.error(`  ❌ Would delete flagged submission: ${sub._id} (flagged: ${sub.flagged}, submittedAt: ${sub.submittedAt?.toLocaleDateString()})`);
          });
          
          // Remove flagged submissions from duplicatesToDelete
          const safeDuplicatesToDelete = duplicatesToDelete.filter(sub => 
            Boolean(sub.flagged) !== true
          );
          console.error(`🔧 FIXED: Removed ${flaggedInDeletes.length} flagged submission(s) from delete list`);
          console.error(`🔧 Will only delete ${safeDuplicatesToDelete.length} safe non-invalidated 0% submission(s)`);
          
          if (safeDuplicatesToDelete.length > 0) {
            const duplicateIds = safeDuplicatesToDelete.map(sub => sub._id);
            const deleteResult = await Submission.deleteMany({
              userId,
              examId,
              _id: { $in: duplicateIds } // Delete only the safe duplicates (non-flagged)
            });
            console.log(`✅ Cleaned up ${deleteResult.deletedCount} duplicate non-invalidated 0% submission(s) (including placeholders)`);
          } else {
            console.log(`✅ No safe duplicates to delete (all were invalidated submissions)`);
          }
        } else {
          // Safe to delete - no flagged submissions in the list
          const duplicateIds = duplicatesToDelete.map(sub => sub._id);
          const deleteResult = await Submission.deleteMany({
            userId,
            examId,
            _id: { $in: duplicateIds } // Delete only the identified duplicates
          });
          console.log(`✅ Cleaned up ${deleteResult.deletedCount} duplicate non-invalidated 0% submission(s) (including placeholders)`);
        }
        
        // Log remaining submissions to verify invalidated submissions are preserved
        const remainingSubmissions = await Submission.find({ userId, examId }).sort({ submittedAt: -1 });
        const flaggedCount = remainingSubmissions.filter(s => Boolean(s.flagged) === true).length;
        const nonFlaggedCount = remainingSubmissions.filter(s => Boolean(s.flagged) !== true).length;
        console.log(`✅ Remaining submissions for this user/exam: ${remainingSubmissions.length} total`);
        console.log(`  📋 Invalidated (flagged): ${flaggedCount} entries (should increase with each invalidation)`);
        console.log(`  📋 Non-invalidated: ${nonFlaggedCount} entries`);
        remainingSubmissions.forEach((sub, idx) => {
          console.log(`  ${idx + 1}. ID: ${sub._id}, flagged: ${Boolean(sub.flagged)}, submittedAt: ${sub.submittedAt?.toLocaleDateString()} ${sub.submittedAt?.toLocaleTimeString()}, score: ${sub.totalPointsAwarded}%`);
        });
      } else {
        console.log(`✅ No duplicate non-invalidated 0% submissions found (cleanup not needed)`);
        
        // Log all submissions to verify invalidated submissions are preserved
        const allSubsAfterCleanup = await Submission.find({ userId, examId }).sort({ submittedAt: -1 });
        const flaggedCount = allSubsAfterCleanup.filter(s => Boolean(s.flagged) === true).length;
        console.log(`✅ All submissions for this user/exam: ${allSubsAfterCleanup.length} total`);
        console.log(`  📋 Invalidated (flagged): ${flaggedCount} entries (should increase with each invalidation)`);
        allSubsAfterCleanup.forEach((sub, idx) => {
          console.log(`  ${idx + 1}. ID: ${sub._id}, flagged: ${Boolean(sub.flagged)}, submittedAt: ${sub.submittedAt?.toLocaleDateString()} ${sub.submittedAt?.toLocaleTimeString()}, score: ${sub.totalPointsAwarded}%`);
        });
      }
    } catch (cleanupError) {
      console.error(`⚠️ Error during cleanup of duplicate submissions:`, cleanupError);
      // Don't fail the entire operation if cleanup fails
    }
    
    // NOTE: We don't need to update old submissions anymore since we always create a NEW submission
    // The new submission is already created correctly with all invalidated answers
    // The atomic update fallback code was removed because it's no longer needed

    // Log the admin action to activity logs with proper admin name
    const adminName = req.user?.name || req.user?.username || 'Admin';
    // Get student name from populated session or fetch separately
    let studentName = 'Unknown Student';
    if (session.userId && typeof session.userId === 'object') {
      studentName = session.userId.name || session.userId.username || 'Unknown Student';
    } else {
      // If not populated, fetch user
      try {
        const user = await User.findById(userId).select('name username');
        if (user) studentName = user.name || user.username || 'Unknown Student';
      } catch (err) {
        console.warn('Could not fetch user for logging:', err);
      }
    }
    const examTitle = exam?.title || (session.examId && typeof session.examId === 'object' ? session.examId.title : 'Unknown Exam');
    
    // Create activity log entry that will appear in activity logs
    // Use 'admin_access' type which is in activityTypes array
    // NOTE: Only create ONE log entry (admin_access) - the admin_invalidate_session log has been removed
    // as requested by the user to reduce noise in activity logs
    await SystemLogs.create({
      type: 'admin_access', // This is in activityTypes array, so it appears in activity logs
      level: 'error',
      message: `${adminName} invalidated exam session for ${studentName}`,
      details: JSON.stringify({
        sessionId,
        userId,
        examId,
        examTitle,
        studentName,
        reason: reason || 'Admin invalidated session',
        action: 'admin_invalidate_session'
      }),
      userId: req.user?.id || req.user?._id,
      userName: adminName,
      examId: examId,
      timestamp: new Date()
    });
    
    // NOTE: Removed admin_invalidate_session log creation as requested
    // Only the admin_access log above is created, which appears in activity logs
    // If detailed system logs are needed, they can be found in the system log files

    // Automatically resolve all violations for this student
    try {
      const unresolvedViolations = await SystemLogs.find({
        userId: userId,
        type: 'violation',
        resolved: { $ne: true }
      });
      
      for (const violation of unresolvedViolations) {
        violation.resolved = true;
        violation.level = 'info';
        if (typeof violation.details === 'object' && violation.details !== null) {
          violation.details.resolved = true;
          violation.details.resolvedAt = new Date();
          violation.details.resolvedBy = req.user?.name || 'Admin';
        }
        await violation.save();
      }
    } catch (resolveErr) {
      console.warn('Failed to auto-resolve violations on invalidation:', resolveErr);
      // Don't fail the entire operation if resolving fails
    }

    const io = getIO();
    if (io) {
      const examTitle = (await Exam.findById(examId).select('title').lean())?.title || 'Unknown';
      
      // Emit session update
      io.to(`exam_${examId}`).emit('live_session_updated', {
        sessionId: session._id.toString(), userId, userName: req.user?.name || 'Admin', examId, examTitle,
        startTime: session.startTime, violationCount: session.violationsCount || 0, status: session.status,
        currentQuestion: session.progressCurrent, totalQuestions: session.progressTotal, lastActivity: session.lastHeartbeat,
      });
      
      // Emit specific invalidation event to notify student in real-time
      io.to(`exam_${examId}`).emit('session_invalidated', {
        sessionId: session._id.toString(),
        userId,
        examId,
        examTitle,
        reason: reason || 'Admin invalidated session',
        invalidatedBy: req.user?.name || 'Admin',
        timestamp: new Date().toISOString()
      });
      
      // Also emit to user-specific room if possible
      io.to(`user_${userId}`).emit('session_invalidated', {
        sessionId: session._id.toString(),
        userId,
        examId,
        examTitle,
        reason: reason || 'Admin invalidated session',
        invalidatedBy: req.user?.name || 'Admin',
        timestamp: new Date().toISOString()
      });
    }

    res.json({ success: true, message: 'Session invalidated' });
  } catch (error) {
    console.error('Error invalidating session:', error);
    res.status(500).json({ success: false, error: 'Failed to invalidate session', message: error.message });
  }
};

export const adminRequireRetake = async (req, res) => {
  try {
    const { sessionId, maxAttempts } = req.body;
    if (!sessionId) return res.status(400).json({ success: false, error: 'Session ID is required' });
    const session = await LiveExamSession.findById(sessionId).populate('examId', 'title');
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    const userId = (session.userId?._id || session.userId).toString();
    const examId = (session.examId?._id || session.examId).toString();

    const latest = await Submission.findOne({ userId, examId }).sort({ submittedAt: -1 });
    if (latest) {
      latest.isRetakeAllowed = true;
      if (maxAttempts && Number(maxAttempts) > (latest.maxAttempts || 1)) {
        latest.maxAttempts = Number(maxAttempts);
      }
      await latest.save();
    }

    await SystemLogs.create({
      type: 'admin_require_retake', level: 'warn',
      message: 'Admin required retake for session',
      details: { sessionId, userId, examId, maxAttempts: maxAttempts || null },
      userId, userName: req.user?.name, timestamp: new Date()
    });

    res.json({ success: true, message: 'Retake granted' });
  } catch (error) {
    console.error('Error requiring retake:', error);
    res.status(500).json({ success: false, error: 'Failed to require retake', message: error.message });
  }
};

export const adminImposePenalty = async (req, res) => {
  try {
    const { sessionId, penaltyPct = 20 } = req.body;
    if (!sessionId) return res.status(400).json({ success: false, error: 'Session ID is required' });
    const session = await LiveExamSession.findById(sessionId).populate('examId', 'title');
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    const userId = (session.userId?._id || session.userId).toString();
    const examId = (session.examId?._id || session.examId).toString();

    const latest = await Submission.findOne({ userId, examId }).sort({ submittedAt: -1 });
    if (latest) {
      const original = latest.totalPointsAwarded || 0;
      const reduced = Math.max(0, Math.round(original * (1 - Number(penaltyPct) / 100)));
      latest.totalPointsAwarded = reduced;
      await latest.save();
    }

    await SystemLogs.create({
      type: 'admin_impose_penalty', level: 'warn',
      message: `Admin imposed ${penaltyPct}% penalty`,
      details: { sessionId, userId, examId, penaltyPct },
      userId, userName: req.user?.name, timestamp: new Date()
    });

    // Emit penalty event to notify student in real-time
    const io = getIO();
    if (io) {
      const examTitle = session.examId?.title || 'Unknown Exam';
      
      io.to(`exam_${examId}`).emit('penalty_applied', {
        sessionId: session._id.toString(),
        userId,
        examId,
        examTitle,
        penaltyPct: Number(penaltyPct),
        appliedBy: req.user?.name || 'Admin',
        timestamp: new Date().toISOString()
      });
      
      io.to(`user_${userId}`).emit('penalty_applied', {
        sessionId: session._id.toString(),
        userId,
        examId,
        examTitle,
        penaltyPct: Number(penaltyPct),
        appliedBy: req.user?.name || 'Admin',
        timestamp: new Date().toISOString()
      });
    }

    res.json({ success: true, message: 'Penalty applied' });
  } catch (error) {
    console.error('Error imposing penalty:', error);
    res.status(500).json({ success: false, error: 'Failed to impose penalty', message: error.message });
  }
};

// Force invalidate submission - replaces all answers with "Cheating is not allowed"
export const forceInvalidateSubmission = async (req, res) => {
  try {
    const { submissionId } = req.body;
    if (!submissionId) {
      return res.status(400).json({ success: false, error: 'Submission ID is required' });
    }

    console.log(`🔧 Force invalidating submission: ${submissionId}`);

    const submission = await Submission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    const userId = submission.userId?.toString() || submission.userId;
    const examId = submission.examId?.toString() || submission.examId;

    console.log(`📝 Processing submission ${submissionId} with ${submission.results?.length || 0} results`);

    // Replace all answers with "Cheating is not allowed" message
    if (submission.results && submission.results.length > 0) {
      // Build update operations for atomic update
      const updateOps = {};
      const unsetOps = {};
      
      submission.results.forEach((result, index) => {
        const questionId = result.userAnswer?.questionId || result.question?.id || result.question?._id?.toString() || '';
        
        // Set nested paths
        updateOps[`results.${index}.userAnswer.answer`] = 'Cheating is not allowed';
        updateOps[`results.${index}.userAnswer.questionId`] = questionId;
        updateOps[`results.${index}.isCorrect`] = false;
        updateOps[`results.${index}.pointsAwarded`] = 0;
        updateOps[`results.${index}.gradingJustification`] = 'Answer invalidated due to cheating detection. This exam attempt has been disqualified.';
        
        // Remove lecturer overrides
        unsetOps[`results.${index}.lecturerOverridePoints`] = '';
        
        console.log(`  ✓ Will update result ${index + 1}: questionId=${questionId}`);
      });

      // Apply atomic update using findByIdAndUpdate
      const updatedSubmission = await Submission.findByIdAndUpdate(
        submissionId,
        {
          $set: {
            ...updateOps,
            totalPointsAwarded: 0,
            flagged: true,
            flagReason: 'Admin forcefully invalidated submission',
            flaggedAt: new Date(),
            flaggedBy: req.user?.name || 'Admin'
          },
          $unset: unsetOps
        },
        { new: true, runValidators: true }
      );

      if (!updatedSubmission) {
        return res.status(500).json({ success: false, error: 'Failed to update submission' });
      }

      console.log(`✅ Force invalidated submission ${submissionId}: ${updatedSubmission.results?.length || 0} answers replaced`);

      // Verify the update worked
      if (updatedSubmission.results && updatedSubmission.results.length > 0) {
        const firstResult = updatedSubmission.results[0];
        console.log(`  🔍 Verification - First result answer: "${firstResult.userAnswer?.answer}"`);
        
        if (firstResult.userAnswer?.answer !== 'Cheating is not allowed') {
          console.error(`  ❌ WARNING: Answer not properly updated! Got: "${firstResult.userAnswer?.answer}"`);
          // Try alternative approach with direct modification
          for (let i = 0; i < updatedSubmission.results.length; i++) {
            updatedSubmission.results[i].userAnswer = {
              questionId: updatedSubmission.results[i].userAnswer?.questionId || '',
              answer: 'Cheating is not allowed'
            };
            updatedSubmission.results[i].isCorrect = false;
            updatedSubmission.results[i].pointsAwarded = 0;
          }
          updatedSubmission.markModified('results');
          await updatedSubmission.save();
          console.log(`  ✅ Applied fallback fix for submission ${submissionId}`);
        }
      }

      // Log the action
      await SystemLogs.create({
        type: 'admin_force_invalidate_submission',
        level: 'error',
        message: `Admin forcefully invalidated submission: ${submissionId}`,
        details: { submissionId, userId, examId },
        userId,
        userName: req.user?.name || 'Admin',
        timestamp: new Date()
      });

      res.json({
        success: true,
        message: 'Submission forcefully invalidated',
        submission: updatedSubmission.toJSON()
      });
    } else {
      // No results to update, just mark as flagged
      submission.totalPointsAwarded = 0;
      submission.flagged = true;
      submission.flagReason = 'Admin forcefully invalidated submission';
      submission.flaggedAt = new Date();
      submission.flaggedBy = req.user?.name || 'Admin';
      await submission.save();

      res.json({
        success: true,
        message: 'Submission flagged (no results to invalidate)',
        submission: submission.toJSON()
      });
    }
  } catch (error) {
    console.error('Error force invalidating submission:', error);
    res.status(500).json({ success: false, error: 'Failed to force invalidate submission', message: error.message });
  }
};
