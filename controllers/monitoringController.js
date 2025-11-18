// Import models from iqbaes-server directory since that's where the data is stored
const mongoose = require('mongoose');
const path = require('path');

// Connect to the same database as iqbaes-server
if (!mongoose.connection.readyState) {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/iqbaes';
  mongoose.connect(mongoUri);
}

// Define SystemLogs schema (matching iqbaes-server/models/SystemLogs.js)
const SystemLogsSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'login', 'login_failed', 'logout', 'registration', 'password_reset_request',
      'exam_access', 'exam_start', 'admin_access', 'lecturer_access', 'system_maintenance',
      'page_view', 'api_request', 'exam_created', 'exam_deleted', 'exam_updated',
      'submission', 'submission_created', 'submission_updated', 'violation',
      'ai_proctoring_violation', 'session_flagged', 'camera_start', 'performance_issue',
      'slow_query', 'memory_warning', 'disk_space_warning', 'high_cpu_usage',
      'database_connection_issue', 'application_start', 'application_shutdown',
      'service_restart', 'configuration_reload', 'cache_cleared', 'scheduled_task_executed',
      'application_error', 'unhandled_exception', 'validation_error', 'database_error',
      'external_service_error', 'timeout_error', 'email_sent', 'email_failed',
      'ai_service_request', 'ai_service_response', 'file_upload', 'file_download',
      'backup_completed', 'backup_failed'
    ],
    required: true
  },
  level: {
    type: String,
    enum: ['debug', 'info', 'warn', 'error', 'fatal'],
    default: 'info'
  },
  message: {
    type: String,
    required: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  userName: {
    type: String
  },
  requestId: { type: String },
  sessionId: { type: String },
  correlationId: { type: String },
  httpMethod: {
    type: String,
    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']
  },
  httpUrl: { type: String },
  httpStatusCode: { type: Number },
  responseTime: { type: Number },
  ipAddress: { type: String },
  userAgent: { type: String },
  referer: { type: String },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  tags: [{ type: String }],
  environment: {
    type: String,
    enum: ['development', 'staging', 'production', 'test'],
    default: 'production'
  },
  source: {
    type: String,
    default: 'application'
  }
}, { timestamps: true });

// Create indexes
SystemLogsSchema.index({ type: 1, timestamp: -1 });
SystemLogsSchema.index({ level: 1, timestamp: -1 });
SystemLogsSchema.index({ userId: 1, timestamp: -1 });
SystemLogsSchema.index({ timestamp: -1 });
SystemLogsSchema.index({ userName: 1, timestamp: -1 });

const SystemLogs = mongoose.model('SystemLogs', SystemLogsSchema);

// Create placeholder models for compatibility
const ExamSubmission = { find: () => ({ exec: () => [] }), updateMany: () => Promise.resolve() };
const Exam = { find: () => ({ exec: () => [] }), findById: () => Promise.resolve(null) };
const User = { find: () => ({ exec: () => [] }), findById: () => Promise.resolve(null) };

// In-memory cache for monitoring data
class MonitoringCache {
  constructor(ttl = 30000) { // 30 seconds default TTL
    this.cache = new Map();
    this.ttl = ttl;
  }

  set(key, data, customTTL = null) {
    const expiry = Date.now() + (customTTL || this.ttl);
    this.cache.set(key, { data, expiry });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }

  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

const cache = new MonitoringCache();

// Streamlined monitoring controller with optimized queries and error handling
class MonitoringController {
  // Get live monitoring data with optimized queries
  async getLiveSessions(req, res) {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      // Get active exam sessions from recent logs (with robust fallbacks)
      const activeSessionsQuery = SystemLogs.aggregate([
        {
          $match: {
            type: 'exam_start',
            timestamp: { $gte: oneHourAgo },
            $or: [
              { userId: { $exists: true, $ne: null } },
              { 'details.studentId': { $exists: true, $ne: null } },
              { 'details.studentName': { $exists: true, $ne: null } }
            ]
          }
        },
        {
          $addFields: {
            effectiveUserId: {
              $ifNull: [
                '$userId',
                { $ifNull: ['$details.studentId', '$details.studentName'] }
              ]
            },
            effectiveUserName: {
              $ifNull: ['$userName', '$details.studentName']
            }
          }
        },
        {
          $group: {
            _id: {
              userId: '$effectiveUserId',
              examId: '$details.examId'
            },
            sessionId: { $first: '$sessionId' },
            userId: { $first: '$effectiveUserId' },
            userName: { $first: '$effectiveUserName' },
            examId: { $first: '$details.examId' },
            examTitle: { $first: '$details.examTitle' },
            startTime: { $first: '$timestamp' },
            ipAddress: { $first: '$ipAddress' },
            userAgent: { $first: '$userAgent' },
            lastActivity: { $max: '$timestamp' }
          }
        },
        {
          $lookup: {
            from: 'systemlogs',
            let: { userId: '$userId', examId: '$examId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$userId', '$$userId'] },
                      { $eq: ['$details.examId', '$$examId'] },
                      { $eq: ['$type', 'violation'] },
                      { $gte: ['$timestamp', oneHourAgo] }
                    ]
                  }
                }
              },
              { $count: 'count' }
            ],
            as: 'violations'
          }
        },
        {
          $addFields: {
            violationCount: {
              $ifNull: [{ $arrayElemAt: ['$violations.count', 0] }, 0]
            }
          }
        },
        {
          $project: {
            sessionId: 1,
            userId: 1,
            userName: 1,
            examId: 1,
            examTitle: 1,
            startTime: 1,
            ipAddress: 1,
            userAgent: 1,
            lastActivity: 1,
            violationCount: 1,
            timeRemaining: {
              $max: [
                0,
                {
                  $subtract: [
                    { $add: ['$startTime', { $multiply: [120, 60000] }] }, // 2 hours default
                    now
                  ]
                }
              ]
            }
          }
        },
        {
          $match: {
            timeRemaining: { $gt: 0 } // Only active sessions
          }
        }
      ]);

      // Get recent alerts/violations
      const alertsQuery = SystemLogs.find({
        type: 'violation',
        timestamp: { $gte: fiveMinutesAgo }
      })
      .sort({ timestamp: -1 })
      .limit(20)
      .select({
        _id: 1,
        userId: 1,
        userName: 1,
        message: 1,
        details: 1,
        timestamp: 1,
        level: 1,
        ipAddress: 1,
        userAgent: 1,
        'details.examId': 1,
        'details.examTitle': 1,
        'details.violationType': 1
      });

      // Execute queries in parallel
      const [activeSessions, alerts] = await Promise.all([
        activeSessionsQuery.exec(),
        alertsQuery.exec()
      ]);

      // Build fallback maps for missing examId and userId in alerts
      const titlesNeedingIds = [...new Set(alerts
        .map(a => (!a.details?.examId && a.details?.examTitle) ? a.details.examTitle : null)
        .filter(Boolean))];
      const namesNeedingIds = [...new Set(alerts
        .map(a => (!a.userId && !a.details?.studentId && (a.userName || a.details?.studentName)) ? (a.userName || a.details?.studentName) : null)
        .filter(Boolean))];

      let examTitleToId = new Map();
      let userNameToId = new Map();
      try {
        if (titlesNeedingIds.length) {
          const Exam = mongoose.models.Exam || mongoose.model('Exam', new mongoose.Schema({ title: String }, { strict: false }));
          const exams = await Exam.find({ title: { $in: titlesNeedingIds } }).select('_id title').lean();
          exams.forEach(e => examTitleToId.set(e.title, e._id));
        }
        if (namesNeedingIds.length) {
          const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({ name: String }, { strict: false }));
          const users = await User.find({ name: { $in: namesNeedingIds } }).select('_id name').lean();
          users.forEach(u => userNameToId.set(u.name, u._id));
        }
      } catch (e) {
        // Non-fatal: proceed without fallback if lookups fail
      }

      // Build session map from real exam_start logs
      const sessionMap = new Map();
      activeSessions.forEach(session => {
        const key = `${String(session.userId)}-${String(session.examId)}`;
        sessionMap.set(key, {
          sessionId: session.sessionId || key,
          userId: session.userId,
          userName: session.userName || 'Unknown Student',
          examId: session.examId,
          examTitle: session.examTitle || 'Unknown Exam',
          startTime: session.startTime,
          timeRemainingMs: session.timeRemaining,
          violationCount: session.violationCount || 0,
          ipAddress: session.ipAddress || 'Unknown',
          userAgent: session.userAgent || 'Unknown',
          lastActivity: session.lastActivity
        });
      });

      // Infer sessions from recent violations when no exam_start exists
      const impliedCounts = new Map();
      alerts.forEach(alert => {
        const nameFallback = alert.userName || alert.details?.studentName;
        const effectiveUserId = alert.userId || alert.details?.studentId || (nameFallback ? userNameToId.get(nameFallback) : null);
        const effectiveUserName = alert.userName || alert.details?.studentName || 'Unknown Student';
        const examId = alert.details?.examId || (alert.details?.examTitle ? examTitleToId.get(alert.details.examTitle) : null);
        if (!effectiveUserId || !examId) return;
        const key = `${String(effectiveUserId)}-${String(examId)}`;
        impliedCounts.set(key, (impliedCounts.get(key) || 0) + 1);
        if (!sessionMap.has(key)) {
          const startTs = alert.timestamp || now;
          const remainingMs = Math.max(0, (120 * 60 * 1000) - (now - startTs));
          sessionMap.set(key, {
            sessionId: key,
            userId: effectiveUserId,
            userName: effectiveUserName,
            examId,
            examTitle: alert.details?.examTitle || 'Unknown Exam',
            startTime: startTs,
            timeRemainingMs: remainingMs,
            violationCount: 0,
            ipAddress: alert.ipAddress || 'Unknown',
            userAgent: alert.userAgent || 'Unknown',
            lastActivity: alert.timestamp
          });
        }
      });

      // Update violation counts for implied sessions
      for (const [key, count] of impliedCounts.entries()) {
        const s = sessionMap.get(key);
        if (s) s.violationCount = Math.max(s.violationCount || 0, count);
      }

      // Process and validate alert data
      const processedAlerts = alerts.map(alert => {
        const nameFallback = alert.userName || alert.details?.studentName;
        const fallbackUserId = alert.userId || alert.details?.studentId || (nameFallback ? userNameToId.get(nameFallback) : null);
        const fallbackExamId = alert.details?.examId || (alert.details?.examTitle ? examTitleToId.get(alert.details.examTitle) : null);
        return ({
          id: alert._id.toString(),
          sessionId: `${fallbackUserId || alert.userId}-${fallbackExamId || alert.details?.examId || 'unknown'}`,
          userId: fallbackUserId || alert.userId,
          userName: alert.userName || 'Unknown Student',
          examId: fallbackExamId,
          examTitle: alert.details?.examTitle || 'Unknown Exam',
          type: alert.details?.violationType || 'violation',
          message: alert.message || 'Violation detected',
          details: alert.details,
          timestamp: alert.timestamp,
          severity: this.determineSeverity(alert.details?.violationType, alert.level),
          resolved: false
        });
      });

      // Finalize sessions list
      const processedSessions = Array.from(sessionMap.values()).map(s => ({
        sessionId: s.sessionId,
        userId: s.userId,
        userName: s.userName,
        examId: s.examId,
        examTitle: s.examTitle,
        startTime: s.startTime,
        timeRemaining: Math.floor((s.timeRemainingMs || 0) / 60000),
        violationCount: s.violationCount || 0,
        ipAddress: s.ipAddress || 'Unknown',
        userAgent: s.userAgent || 'Unknown',
        lastActivity: s.lastActivity,
        currentQuestion: 1,
        totalQuestions: 10,
        status: (s.violationCount >= 5 ? 'flagged' : 'active')
      }));

      // Return structured response compatible with client hook
      res.json({
        success: true,
        timestamp: now,
        sessions: processedSessions,
        alerts: processedAlerts,
        stats: {
          totalSessions: processedSessions.length,
          activeSessions: processedSessions.filter(s => s.status === 'active').length,
          flaggedSessions: processedSessions.filter(s => s.status === 'flagged').length,
          totalAlerts: processedAlerts.length,
          criticalAlerts: processedAlerts.filter(a => a.severity === 'critical').length
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

      // Update the alert in SystemLogs
      const result = await SystemLogs.findByIdAndUpdate(
        alertId,
        {
          $set: {
            'details.resolved': true,
            'details.resolvedAt': new Date(),
            'details.resolvedBy': req.user?.id || 'system'
          }
        },
        { new: true }
      );

      if (!result) {
        return res.status(404).json({
          success: false,
          error: 'Alert not found'
        });
      }

      // Log the resolution
      await SystemLogs.create({
        type: 'alert_resolved',
        level: 'info',
        message: `Alert ${alertId} resolved`,
        details: {
          alertId,
          resolvedBy: req.user?.id || 'system',
          originalAlert: result
        },
        userId: req.user?.id,
        userName: req.user?.name,
        timestamp: new Date()
      });

      res.json({
        success: true,
        message: 'Alert resolved successfully',
        data: result
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

      // Extract userId and examId from sessionId
      const [userId, examId] = sessionId.split('-');

      if (!userId || !examId) {
        return res.status(400).json({
          success: false,
          error: 'Invalid session ID format'
        });
      }

      // Get user and exam details
      const [user, exam] = await Promise.all([
        User.findById(userId).select('name email'),
        Exam.findById(examId).select('title')
      ]);

      // Create flag log entry
      const flagLog = await SystemLogs.create({
        type: 'session_flagged',
        level: 'warning',
        message: `Session flagged: ${reason}`,
        details: {
          sessionId,
          reason,
          flaggedBy: req.user?.id || 'system',
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
      await ExamSubmission.updateMany(
        { userId, examId },
        {
          $set: {
            flagged: true,
            flagReason: reason,
            flaggedAt: new Date(),
            flaggedBy: req.user?.id || 'system'
          }
        }
      );

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
    const startTime = Date.now();
    
    try {
      // Input validation
      const { 
        page = 1, 
        limit = 10, 
        examId, 
        userId, 
        severity, 
        startDate, 
        endDate 
      } = req.query;
      
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit))); // Cap at 100
      const skip = (pageNum - 1) * limitNum;
      
      // Create cache key
      const cacheKey = `violations:${JSON.stringify(req.query)}`;
      const cached = cache.get(cacheKey);
      
      if (cached) {
        return res.json({
          ...cached,
          cached: true,
          queryTime: Date.now() - startTime
        });
      }
      
      // Build optimized filter with indexed fields first
      const filter = { type: 'violation' };
      
      if (examId) filter['details.examId'] = examId;
      if (userId) filter.userId = userId;
      if (severity) filter.level = severity;
      
      // Optimize date range queries
      if (startDate || endDate) {
        filter.timestamp = {};
        if (startDate) filter.timestamp.$gte = new Date(startDate);
        if (endDate) filter.timestamp.$lte = new Date(endDate);
      }
      
      // Use Promise.all for parallel execution
      const [violations, total] = await Promise.all([
        SystemLogs.find(filter)
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limitNum)
          .select({
            userId: 1,
            userName: 1,
            message: 1,
            details: 1,
            timestamp: 1,
            level: 1
          })
          .lean(), // Use lean() for better performance
        SystemLogs.countDocuments(filter)
      ]);
      
      const result = {
        success: true,
        data: {
          violations: violations.map(v => ({
            ...v,
            userName: v.userName || 'Unknown Student',
            examTitle: v.details?.examTitle || 'Unknown Exam'
          })),
          pagination: {
            current: pageNum,
            pages: Math.ceil(total / limitNum),
            total,
            limit: limitNum
          }
        },
        queryTime: Date.now() - startTime
      };
      
      // Cache the result for 30 seconds
      cache.set(cacheKey, result, 30000);
      
      res.json(result);
    } catch (error) {
      console.error('Error fetching violations:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch violations',
        message: error.message,
        queryTime: Date.now() - startTime
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

  // Optimized live sessions with caching
  async getLiveSessionsOptimized(req, res) {
    const startTime = Date.now();
    
    try {
      const cacheKey = 'live-sessions';
      const cached = cache.get(cacheKey);
      
      if (cached) {
        return res.json({
          ...cached,
          cached: true,
          queryTime: Date.now() - startTime
        });
      }
      
      // Use aggregation pipeline for efficient data retrieval
      const pipeline = [
        {
          $match: {
            type: 'session',
            timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
          }
        },
        {
          $lookup: {
            from: 'systemlogs',
            let: { sessionUserId: '$userId', sessionExamId: '$examId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$userId', '$$sessionUserId'] },
                      { $eq: ['$examId', '$$sessionExamId'] },
                      { $eq: ['$type', 'violation'] }
                    ]
                  }
                }
              },
              { $count: 'count' }
            ],
            as: 'violationCount'
          }
        },
        {
          $addFields: {
            violationCount: { $ifNull: [{ $arrayElemAt: ['$violationCount.count', 0] }, 0] }
          }
        },
        { $limit: 50 }, // Limit results for performance
        { $sort: { timestamp: -1 } }
      ];
      
      const sessions = await SystemLogs.aggregate(pipeline);
      
      // Get recent alerts
      const alerts = await SystemLogs.find({
        type: 'violation',
        timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
      })
      .sort({ timestamp: -1 })
      .limit(20)
      .lean();
      
      const result = {
        success: true,
        sessions: sessions.map(session => ({
          sessionId: session._id,
          userId: session.userId,
          userName: session.userName || 'Unknown Student',
          examId: session.examId,
          examTitle: session.examTitle || 'Unknown Exam',
          startTime: session.timestamp,
          violationCount: session.violationCount,
          ipAddress: session.ipAddress || 'Unknown',
          timeRemaining: Math.max(0, session.timeRemaining || 0)
        })),
        alerts: alerts.map(alert => ({
          id: alert._id,
          sessionId: alert.sessionId,
          userName: alert.userName || 'Unknown Student',
          userId: alert.userId,
          message: alert.message,
          examTitle: alert.examTitle || 'Unknown Exam',
          examId: alert.examId,
          type: alert.type,
          timestamp: alert.timestamp,
          severity: alert.level || 'medium'
        })),
        timestamp: new Date(),
        queryTime: Date.now() - startTime
      };
      
      // Cache for 30 seconds
      cache.set(cacheKey, result, 30000);
      
      res.json(result);
    } catch (error) {
      console.error('Error fetching live sessions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch live sessions',
        message: error.message,
        queryTime: Date.now() - startTime
      });
    }
  }

  // Optimized stats with caching
  async getOptimizedStats(req, res) {
    const startTime = Date.now();
    
    try {
      const cacheKey = 'monitoring-stats';
      const cached = cache.get(cacheKey);
      
      if (cached) {
        return res.json({
          ...cached,
          cached: true,
          queryTime: Date.now() - startTime
        });
      }
      
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
      
      // Use aggregation for efficient stats calculation
      const [sessionStats, violationStats] = await Promise.all([
        SystemLogs.aggregate([
          {
            $match: {
              type: 'session',
              timestamp: { $gte: last24Hours }
            }
          },
          {
            $group: {
              _id: null,
              totalSessions: { $sum: 1 },
              activeSessions: {
                $sum: {
                  $cond: [
                    { $gt: ['$timeRemaining', 0] },
                    1,
                    0
                  ]
                }
              }
            }
          }
        ]),
        SystemLogs.aggregate([
          {
            $match: {
              type: 'violation'
            }
          },
          {
            $group: {
              _id: null,
              totalViolations: { $sum: 1 },
              recentViolations: {
                $sum: {
                  $cond: [
                    { $gte: ['$timestamp', lastHour] },
                    1,
                    0
                  ]
                }
              }
            }
          }
        ])
      ]);
      
      const stats = {
        totalSessions: sessionStats[0]?.totalSessions || 0,
        activeSessions: sessionStats[0]?.activeSessions || 0,
        totalViolations: violationStats[0]?.totalViolations || 0,
        recentViolations: violationStats[0]?.recentViolations || 0,
        totalAlerts: violationStats[0]?.totalViolations || 0,
        recentAlerts: violationStats[0]?.recentViolations || 0
      };
      
      const result = {
        success: true,
        stats,
        timestamp: now,
        queryTime: Date.now() - startTime
      };
      
      // Cache for 60 seconds
      cache.set(cacheKey, result, 60000);
      
      res.json(result);
    } catch (error) {
      console.error('Error fetching stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch stats',
        message: error.message,
        queryTime: Date.now() - startTime
      });
    }
  }

  // Health check endpoint with performance metrics
  async healthCheck(req, res) {
    try {
      const startTime = Date.now();
      
      // Test database query performance
      const testQuery = SystemLogs.findOne().sort({ timestamp: -1 });
      const dbResult = await testQuery;
      const queryTime = Date.now() - startTime;
      
      const stats = {
        status: 'healthy',
        timestamp: new Date(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        database: 'connected',
        performance: {
          queryTime,
          cacheSize: cache.size(),
          cacheStats: cache.getStats()
        },
        recentLogs: dbResult ? 1 : 0
      };

      res.json({ success: true, stats });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Health check failed',
        message: error.message
      });
    }
  }

  // Clear cache endpoint for debugging
  async clearCache(req, res) {
    try {
      const sizeBefore = cache.size();
      cache.clear();
      
      res.json({
        success: true,
        message: `Cache cleared. Removed ${sizeBefore} entries.`,
        timestamp: new Date()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to clear cache',
        message: error.message
      });
    }
  }
}

module.exports = new MonitoringController();