import mongoose from 'mongoose';

const AuthenticationLogsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  userName: {
    type: String
  },
  type: {
    type: String,
    enum: [
      'login',
      'logout',
      'login_failed',
      'account_locked',
      'account_unlocked',
      'password_reset_request',
      'password_reset_complete',
      'password_changed',
      'session_expired',
      'token_refresh',
      'two_factor_enabled',
      'two_factor_disabled',
      'two_factor_verified',
      'two_factor_failed',
      'registration',
      'email_verification',
      'suspicious_login'
    ],
    required: true
  },
  status: {
    type: String,
    enum: ['success', 'failure', 'pending', 'blocked'],
    required: true
  },
  details: {
    type: String,
    required: true
  },
  // Authentication method
  authMethod: {
    type: String,
    enum: ['password', 'two_factor', 'social_login', 'api_key', 'token'],
    default: 'password'
  },
  // Session information
  sessionId: {
    type: String
  },
  sessionDuration: {
    type: Number // in milliseconds
  },
  tokenType: {
    type: String,
    enum: ['access', 'refresh', 'reset', 'verification']
  },
  // Network and device information
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: {
    type: String
  },
  deviceInfo: {
    browser: String,
    os: String,
    device: String,
    isMobile: Boolean
  },
  deviceFingerprint: {
    type: String
  },
  // Geolocation data
  location: {
    country: String,
    region: String,
    city: String,
    latitude: Number,
    longitude: Number,
    timezone: String,
    isp: String
  },
  // Risk assessment
  riskScore: {
    type: Number,
    min: 0,
    max: 10,
    default: 0
  },
  riskFactors: [{
    factor: {
      type: String,
      enum: [
        'new_device',
        'new_location',
        'unusual_time',
        'multiple_attempts',
        'suspicious_ip',
        'tor_network',
        'vpn_detected',
        'bot_detected'
      ]
    },
    score: Number,
    details: String
  }],
  // Failure-specific data
  failureReason: {
    type: String,
    enum: [
      'invalid_credentials',
      'account_locked',
      'account_disabled',
      'token_expired',
      'token_invalid',
      'two_factor_required',
      'two_factor_failed',
      'rate_limited',
      'suspicious_activity'
    ]
  },
  attemptNumber: {
    type: Number,
    default: 1
  },
  // Response actions
  actionTaken: {
    type: String,
    enum: [
      'none',
      'account_locked',
      'rate_limited',
      'two_factor_required',
      'admin_notified',
      'ip_blocked',
      'captcha_required'
    ],
    default: 'none'
  },
  // Timestamps
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  expiresAt: {
    type: Date // For session expiration tracking
  }
}, { timestamps: true });

// Indexes for efficient queries
AuthenticationLogsSchema.index({ userId: 1, timestamp: -1 });
AuthenticationLogsSchema.index({ type: 1, status: 1 });
AuthenticationLogsSchema.index({ ipAddress: 1, timestamp: -1 });
AuthenticationLogsSchema.index({ timestamp: -1 });
AuthenticationLogsSchema.index({ sessionId: 1 });
AuthenticationLogsSchema.index({ riskScore: -1 });
AuthenticationLogsSchema.index({ deviceFingerprint: 1 });

// TTL index for automatic cleanup of old logs (keep for 1 year)
AuthenticationLogsSchema.index({ timestamp: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

// Virtual for determining if login is suspicious
AuthenticationLogsSchema.virtual('isSuspicious').get(function() {
  return this.riskScore > 5 || this.riskFactors.length > 2;
});

// Method to calculate risk score
AuthenticationLogsSchema.methods.calculateRiskScore = function() {
  let score = 0;
  
  // Base score for failure types
  if (this.status === 'failure') {
    score += 2;
    if (this.attemptNumber > 3) score += 3;
  }
  
  // Add risk factor scores
  this.riskFactors.forEach(factor => {
    score += factor.score || 1;
  });
  
  // Location-based risk
  if (this.location && this.location.country) {
    // Add logic for high-risk countries if needed
  }
  
  this.riskScore = Math.min(score, 10);
  return this.riskScore;
};

// Static method to get login patterns for user
AuthenticationLogsSchema.statics.getUserLoginPatterns = function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        type: { $in: ['login', 'login_failed'] },
        timestamp: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          hour: { $hour: '$timestamp' },
          dayOfWeek: { $dayOfWeek: '$timestamp' },
          status: '$status'
        },
        count: { $sum: 1 },
        avgRiskScore: { $avg: '$riskScore' },
        locations: { $addToSet: '$location.city' },
        devices: { $addToSet: '$deviceInfo.device' }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

// Static method to detect brute force attacks
AuthenticationLogsSchema.statics.detectBruteForce = function(timeWindow = 15) {
  const startTime = new Date(Date.now() - timeWindow * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        type: 'login_failed',
        timestamp: { $gte: startTime }
      }
    },
    {
      $group: {
        _id: {
          ipAddress: '$ipAddress',
          userId: '$userId'
        },
        attempts: { $sum: 1 },
        latestAttempt: { $max: '$timestamp' },
        userNames: { $addToSet: '$userName' }
      }
    },
    {
      $match: {
        attempts: { $gte: 5 } // 5 or more failed attempts
      }
    },
    { $sort: { attempts: -1 } }
  ]);
};

// Static method to get authentication statistics
AuthenticationLogsSchema.statics.getAuthStats = function(days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    { $match: { timestamp: { $gte: startDate } } },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          type: '$type',
          status: '$status'
        },
        count: { $sum: 1 },
        avgRiskScore: { $avg: '$riskScore' },
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
    { $sort: { '_id.date': 1 } }
  ]);
};

AuthenticationLogsSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
  }
});

const AuthenticationLogs = mongoose.model('AuthenticationLogs', AuthenticationLogsSchema);
export default AuthenticationLogs;