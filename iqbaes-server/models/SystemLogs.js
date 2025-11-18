import mongoose from 'mongoose';

const SystemLogsSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      // Authentication and user access
      'login',
      'login_failed',
      'logout',
      'registration',
      'password_reset_request',
      // System access and navigation
      'exam_access',
      'exam_start',
      'admin_access',
      'lecturer_access',
      'system_maintenance',
      'page_view',
      'api_request',
      // Exam and submission events
      'exam_created',
      'exam_deleted',
      'exam_updated',
      'submission',
      'submission_created',
      'submission_updated',
      // Security and monitoring
      'violation',
      'ai_proctoring_violation',
      'session_flagged',
      'camera_start',
      'heartbeat',
      // Admin actions
      'admin_invalidate_session',
      'admin_impose_penalty',
      'admin_require_retake',
      'admin_force_invalidate_submission',
      'admin_unlock_account',
      // Performance and monitoring
      'performance_issue',
      'slow_query',
      'memory_warning',
      'disk_space_warning',
      'high_cpu_usage',
      'database_connection_issue',
      // Application events
      'application_start',
      'application_shutdown',
      'service_restart',
      'configuration_reload',
      'cache_cleared',
      'scheduled_task_executed',
      // Error and exception handling
      'application_error',
      'unhandled_exception',
      'validation_error',
      'database_error',
      'external_service_error',
      'timeout_error',
      // Integration and external services
      'email_sent',
      'email_failed',
      'ai_service_request',
      'ai_service_response',
      'file_upload',
      'file_download',
      'backup_completed',
      'backup_failed'
    ],
    required: true
  },
  level: {
    type: String,
    enum: ['debug', 'info', 'warn', 'error', 'fatal'],
    default: 'info'
  },
  resolved: {
    type: Boolean,
    default: false
  },
  message: {
    type: String,
    required: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed
  },
  // User context (optional for system events)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  userName: {
    type: String
  },
  // Request context
  requestId: {
    type: String
  },
  sessionId: {
    type: String
  },
  correlationId: {
    type: String
  },
  // HTTP request details
  httpMethod: {
    type: String,
    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']
  },
  httpUrl: {
    type: String
  },
  httpStatusCode: {
    type: Number
  },
  responseTime: {
    type: Number // in milliseconds
  },
  // Network information
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  referer: {
    type: String
  },
  // System metrics
  metrics: {
    cpuUsage: { type: Number },
    memoryUsage: { type: Number },
    diskUsage: { type: Number },
    activeConnections: { type: Number },
    queueSize: { type: Number },
    cacheHitRate: { type: Number }
  },
  // Error information
  error: {
    name: { type: String },
    message: { type: String },
    stack: { type: String },
    code: { type: String },
    statusCode: { type: Number }
  },
  // Service information
  service: {
    name: { type: String },
    version: { type: String },
    environment: {
      type: String,
      enum: ['development', 'staging', 'production', 'test']
    },
    hostname: { type: String },
    pid: { type: Number }
  },
  // External service details
  externalService: {
    name: { type: String },
    endpoint: { type: String },
    responseTime: { type: Number },
    statusCode: { type: Number },
    retryCount: { type: Number }
  },
  // File operation details
  fileOperation: {
    operation: {
      type: String,
      enum: ['upload', 'download', 'delete', 'move', 'copy']
    },
    filename: { type: String },
    fileSize: { type: Number },
    mimeType: { type: String },
    path: { type: String }
  },
  // Database operation details
  dbOperation: {
    operation: {
      type: String,
      enum: ['find', 'insert', 'update', 'delete', 'aggregate']
    },
    collection: { type: String },
    executionTime: { type: Number },
    documentsAffected: { type: Number },
    query: { type: mongoose.Schema.Types.Mixed }
  },
  // Timestamps
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  // Additional metadata
  tags: [{
    type: String
  }],
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

// Indexes for efficient queries
SystemLogsSchema.index({ type: 1, timestamp: -1 });
SystemLogsSchema.index({ level: 1, timestamp: -1 });
SystemLogsSchema.index({ userId: 1, timestamp: -1 });
SystemLogsSchema.index({ timestamp: -1 });
SystemLogsSchema.index({ requestId: 1 });
SystemLogsSchema.index({ sessionId: 1 });
SystemLogsSchema.index({ correlationId: 1 });
SystemLogsSchema.index({ 'service.name': 1, timestamp: -1 });
SystemLogsSchema.index({ httpStatusCode: 1, timestamp: -1 });
SystemLogsSchema.index({ tags: 1, timestamp: -1 });
SystemLogsSchema.index({ resolved: 1, type: 1 }); // For filtering resolved violations

// TTL index for automatic cleanup (keep system logs for 90 days)
SystemLogsSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// Virtual for determining if log is critical
SystemLogsSchema.virtual('isCritical').get(function() {
  return this.level === 'error' || this.level === 'fatal' ||
         (this.httpStatusCode && this.httpStatusCode >= 500) ||
         (this.responseTime && this.responseTime > 5000);
});

// Method to add correlation ID for request tracking
SystemLogsSchema.methods.addCorrelation = function(correlationId) {
  this.correlationId = correlationId;
  return this.save();
};

// Static method to get error summary
SystemLogsSchema.statics.getErrorSummary = function(hours = 24) {
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        level: { $in: ['error', 'fatal'] },
        timestamp: { $gte: startTime }
      }
    },
    {
      $group: {
        _id: {
          type: '$type',
          errorName: '$error.name',
          statusCode: '$httpStatusCode'
        },
        count: { $sum: 1 },
        latestOccurrence: { $max: '$timestamp' },
        affectedUsers: { $addToSet: '$userId' },
        sampleMessage: { $first: '$message' }
      }
    },
    {
      $addFields: {
        affectedUserCount: { $size: '$affectedUsers' }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

// Static method to get performance metrics
SystemLogsSchema.statics.getPerformanceMetrics = function(hours = 1) {
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        timestamp: { $gte: startTime },
        responseTime: { $exists: true }
      }
    },
    {
      $group: {
        _id: {
          httpMethod: '$httpMethod',
          httpUrl: '$httpUrl'
        },
        avgResponseTime: { $avg: '$responseTime' },
        maxResponseTime: { $max: '$responseTime' },
        minResponseTime: { $min: '$responseTime' },
        requestCount: { $sum: 1 },
        errorCount: {
          $sum: {
            $cond: [{ $gte: ['$httpStatusCode', 400] }, 1, 0]
          }
        }
      }
    },
    {
      $addFields: {
        errorRate: {
          $multiply: [
            { $divide: ['$errorCount', '$requestCount'] },
            100
          ]
        }
      }
    },
    { $sort: { avgResponseTime: -1 } }
  ]);
};

// Static method to get system health metrics
SystemLogsSchema.statics.getSystemHealth = function(minutes = 30) {
  const startTime = new Date(Date.now() - minutes * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        timestamp: { $gte: startTime },
        'metrics.cpuUsage': { $exists: true }
      }
    },
    {
      $group: {
        _id: null,
        avgCpuUsage: { $avg: '$metrics.cpuUsage' },
        maxCpuUsage: { $max: '$metrics.cpuUsage' },
        avgMemoryUsage: { $avg: '$metrics.memoryUsage' },
        maxMemoryUsage: { $max: '$metrics.memoryUsage' },
        avgActiveConnections: { $avg: '$metrics.activeConnections' },
        maxActiveConnections: { $max: '$metrics.activeConnections' },
        avgCacheHitRate: { $avg: '$metrics.cacheHitRate' }
      }
    }
  ]);
};

// Static method to get API usage statistics
SystemLogsSchema.statics.getApiUsage = function(hours = 24) {
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        type: 'api_request',
        timestamp: { $gte: startTime }
      }
    },
    {
      $group: {
        _id: {
          endpoint: '$httpUrl',
          method: '$httpMethod',
          statusCode: '$httpStatusCode'
        },
        count: { $sum: 1 },
        avgResponseTime: { $avg: '$responseTime' },
        uniqueUsers: { $addToSet: '$userId' },
        uniqueIPs: { $addToSet: '$ipAddress' }
      }
    },
    {
      $addFields: {
        uniqueUserCount: { $size: '$uniqueUsers' },
        uniqueIPCount: { $size: '$uniqueIPs' }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

// Static method to detect anomalies
SystemLogsSchema.statics.detectAnomalies = function(hours = 1) {
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        timestamp: { $gte: startTime },
        $or: [
          { responseTime: { $gt: 10000 } }, // Slow responses > 10s
          { 'metrics.cpuUsage': { $gt: 90 } }, // High CPU > 90%
          { 'metrics.memoryUsage': { $gt: 85 } }, // High memory > 85%
          { httpStatusCode: { $gte: 500 } }, // Server errors
          { level: 'fatal' } // Fatal errors
        ]
      }
    },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        latestOccurrence: { $max: '$timestamp' },
        samples: { $push: {
          message: '$message',
          timestamp: '$timestamp',
          details: '$details'
        }}
      }
    },
    { $sort: { count: -1 } }
  ]);
};

SystemLogsSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    // Hide sensitive stack traces in JSON output
    if (ret.error && ret.error.stack) {
      ret.error.stack = '[REDACTED]';
    }
  }
});

const SystemLogs = mongoose.model('SystemLogs', SystemLogsSchema);
export default SystemLogs;