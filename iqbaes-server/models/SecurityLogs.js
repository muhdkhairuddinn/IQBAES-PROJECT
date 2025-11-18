import mongoose from 'mongoose';

const SecurityLogsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: [
      'violation',
      'ai_proctoring_violation',
      'session_flagged',
      'camera_start',
      'suspicious_activity',
      'unauthorized_access_attempt',
      'security_breach',
      'data_access_violation',
      'privilege_escalation_attempt'
    ],
    required: true
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  details: {
    type: String,
    required: true
  },
  // Exam-related fields
  examId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam'
  },
  examTitle: {
    type: String
  },
  // Violation-specific data
  violationType: {
    type: String,
    enum: [
      'multiple_faces',
      'no_face_detected',
      'looking_away',
      'suspicious_movement',
      'unauthorized_device',
      'screen_sharing',
      'copy_paste',
      'tab_switching',
      'window_focus_lost',
      'fullscreen_exit'
    ]
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1
  },
  // AI detection data
  aiModelVersion: {
    type: String
  },
  detectionData: {
    type: mongoose.Schema.Types.Mixed // Store AI detection results
  },
  // Session information
  sessionId: {
    type: String
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  // Network and device info
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  deviceFingerprint: {
    type: String
  },
  // Geolocation data
  location: {
    latitude: { type: Number },
    longitude: { type: Number },
    accuracy: { type: Number },
    timestamp: { type: Date }
  },
  // Response and mitigation
  actionTaken: {
    type: String,
    enum: [
      'none',
      'warning_issued',
      'exam_paused',
      'exam_terminated',
      'account_flagged',
      'admin_notified',
      'automatic_submission'
    ],
    default: 'none'
  },
  autoResolved: {
    type: Boolean,
    default: false
  },
  // Evidence storage
  evidenceFiles: [{
    type: {
      type: String,
      enum: ['screenshot', 'video', 'audio', 'log_file']
    },
    filename: String,
    path: String,
    size: Number,
    uploadedAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

// Indexes for efficient queries
SecurityLogsSchema.index({ userId: 1, timestamp: -1 });
SecurityLogsSchema.index({ examId: 1, timestamp: -1 });
SecurityLogsSchema.index({ type: 1, severity: 1 });
SecurityLogsSchema.index({ timestamp: -1 });
SecurityLogsSchema.index({ severity: 1, autoResolved: 1 });
SecurityLogsSchema.index({ sessionId: 1 });
SecurityLogsSchema.index({ ipAddress: 1, timestamp: -1 });

// Virtual for risk score calculation
SecurityLogsSchema.virtual('riskScore').get(function() {
  let score = 0;
  
  // Base score by severity
  const severityScores = { low: 1, medium: 3, high: 7, critical: 10 };
  score += severityScores[this.severity] || 0;
  
  // Add confidence factor for AI detections
  if (this.confidence) {
    score *= this.confidence;
  }
  
  // Increase score for repeated violations
  if (this.violationType) {
    score *= 1.2;
  }
  
  return Math.round(score * 10) / 10;
});

// Method to create alert if needed
SecurityLogsSchema.methods.createAlertIfNeeded = async function() {
  const AlertResolutions = mongoose.model('AlertResolutions');
  
  // Create alert for high/critical severity or repeated violations
  if (this.severity === 'high' || this.severity === 'critical' || this.riskScore > 5) {
    const alert = new AlertResolutions({
      alertId: this._id,
      alertType: 'SecurityLogs',
      userId: this.userId,
      examId: this.examId,
      severity: this.severity,
      flaggedAt: this.timestamp
    });
    
    await alert.save();
    return alert;
  }
  
  return null;
};

// Static method to get violation summary for user
SecurityLogsSchema.statics.getUserViolationSummary = function(userId, examId = null) {
  const match = { userId };
  if (examId) match.examId = examId;
  
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        latestViolation: { $max: '$timestamp' },
        avgConfidence: { $avg: '$confidence' },
        severities: { $push: '$severity' }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

// Static method to get security trends
SecurityLogsSchema.statics.getSecurityTrends = function(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    { $match: { timestamp: { $gte: startDate } } },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          type: '$type',
          severity: '$severity'
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.date': 1 } }
  ]);
};

SecurityLogsSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    delete ret.detectionData; // Hide sensitive AI data
  }
});

const SecurityLogs = mongoose.model('SecurityLogs', SecurityLogsSchema);
export default SecurityLogs;