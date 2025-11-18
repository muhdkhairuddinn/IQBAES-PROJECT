import mongoose from 'mongoose';

const AuditLogsSchema = new mongoose.Schema({
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
      // User management
      'user_created',
      'user_updated',
      'user_deleted',
      'user_profile_updated',
      'user_role_changed',
      'user_activated',
      'user_deactivated',
      // Course management
      'course_created',
      'course_updated',
      'course_deleted',
      'course_published',
      'course_archived',
      'enrollment_added',
      'enrollment_removed',
      // Exam management
      'exam_created',
      'exam_updated',
      'exam_deleted',
      'exam_published',
      'exam_archived',
      'exam_graded',
      'exam_settings_changed',
      // Submission management
      'submission_created',
      'submission_updated',
      'submission_graded',
      'submission_flagged',
      'retake_granted',
      'retake_revoked',
      // Question bank management
      'question_created',
      'question_updated',
      'question_deleted',
      'question_imported',
      'bulk_questions_generated',
      // System configuration
      'system_settings_changed',
      'backup_created',
      'backup_restored',
      'maintenance_mode_enabled',
      'maintenance_mode_disabled'
    ],
    required: true
  },
  action: {
    type: String,
    enum: ['create', 'read', 'update', 'delete', 'execute', 'configure'],
    required: true
  },
  resource: {
    type: String,
    enum: ['user', 'course', 'exam', 'submission', 'question', 'system', 'enrollment'],
    required: true
  },
  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    // Dynamic reference based on resource type
    refPath: 'resource'
  },
  details: {
    type: String,
    required: true
  },
  // Change tracking
  changes: {
    before: {
      type: mongoose.Schema.Types.Mixed
    },
    after: {
      type: mongoose.Schema.Types.Mixed
    },
    fields: [{
      field: String,
      oldValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed
    }]
  },
  // Context information
  context: {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam'
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course'
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    batchOperation: {
      type: Boolean,
      default: false
    },
    batchId: {
      type: String
    }
  },
  // Impact assessment
  impact: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low'
  },
  affectedUsers: {
    type: Number,
    default: 0
  },
  // Compliance and regulatory
  complianceFlags: [{
    regulation: {
      type: String,
      enum: ['GDPR', 'FERPA', 'COPPA', 'SOX', 'HIPAA']
    },
    requirement: String,
    status: {
      type: String,
      enum: ['compliant', 'non_compliant', 'review_required']
    }
  }],
  // Metadata
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  source: {
    type: String,
    enum: ['web_ui', 'api', 'system', 'batch_job', 'migration'],
    default: 'web_ui'
  },
  // Approval workflow
  requiresApproval: {
    type: Boolean,
    default: false
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'not_required'],
    default: 'not_required'
  }
}, { timestamps: true });

// Indexes for efficient queries
AuditLogsSchema.index({ userId: 1, timestamp: -1 });
AuditLogsSchema.index({ type: 1, timestamp: -1 });
AuditLogsSchema.index({ resource: 1, resourceId: 1 });
AuditLogsSchema.index({ timestamp: -1 });
AuditLogsSchema.index({ 'context.examId': 1, timestamp: -1 });
AuditLogsSchema.index({ 'context.courseId': 1, timestamp: -1 });
AuditLogsSchema.index({ impact: 1, timestamp: -1 });
AuditLogsSchema.index({ source: 1, timestamp: -1 });

// TTL index for automatic cleanup (keep audit logs for 7 years for compliance)
AuditLogsSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7 * 365 * 24 * 60 * 60 });

// Virtual for determining if action is sensitive
AuditLogsSchema.virtual('isSensitive').get(function() {
  const sensitiveActions = ['delete', 'user_role_changed', 'system_settings_changed'];
  const sensitiveResources = ['user', 'system'];
  
  return sensitiveActions.includes(this.type) || 
         sensitiveResources.includes(this.resource) ||
         this.impact === 'high' || this.impact === 'critical';
});

// Method to add compliance flag
AuditLogsSchema.methods.addComplianceFlag = function(regulation, requirement, status) {
  this.complianceFlags.push({
    regulation,
    requirement,
    status
  });
  return this.save();
};

// Method to approve action
AuditLogsSchema.methods.approve = function(approvedBy) {
  this.approvedBy = approvedBy;
  this.approvedAt = new Date();
  this.approvalStatus = 'approved';
  return this.save();
};

// Static method to get audit trail for resource
AuditLogsSchema.statics.getResourceAuditTrail = function(resource, resourceId, limit = 50) {
  return this.find({ resource, resourceId })
    .populate('userId', 'name username')
    .populate('approvedBy', 'name username')
    .sort({ timestamp: -1 })
    .limit(limit);
};

// Static method to get user activity summary
AuditLogsSchema.statics.getUserActivitySummary = function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        timestamp: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          resource: '$resource',
          action: '$action'
        },
        count: { $sum: 1 },
        latestActivity: { $max: '$timestamp' },
        impactLevels: { $push: '$impact' }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

// Static method to get compliance report
AuditLogsSchema.statics.getComplianceReport = function(regulation, days = 90) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        timestamp: { $gte: startDate },
        'complianceFlags.regulation': regulation
      }
    },
    {
      $unwind: '$complianceFlags'
    },
    {
      $match: {
        'complianceFlags.regulation': regulation
      }
    },
    {
      $group: {
        _id: '$complianceFlags.status',
        count: { $sum: 1 },
        actions: { $addToSet: '$type' },
        users: { $addToSet: '$userId' }
      }
    }
  ]);
};

// Static method to get high-impact activities
AuditLogsSchema.statics.getHighImpactActivities = function(days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.find({
    timestamp: { $gte: startDate },
    impact: { $in: ['high', 'critical'] }
  })
  .populate('userId', 'name username role')
  .populate('approvedBy', 'name username')
  .sort({ timestamp: -1 });
};

// Static method to detect unusual patterns
AuditLogsSchema.statics.detectUnusualPatterns = function(userId, hours = 24) {
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        timestamp: { $gte: startTime }
      }
    },
    {
      $group: {
        _id: {
          hour: { $hour: '$timestamp' },
          action: '$action',
          resource: '$resource'
        },
        count: { $sum: 1 },
        activities: { $push: '$type' }
      }
    },
    {
      $match: {
        count: { $gte: 10 } // 10 or more similar actions in an hour
      }
    },
    { $sort: { count: -1 } }
  ]);
};

AuditLogsSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    // Hide sensitive change data in JSON output
    if (ret.changes && ret.changes.before) {
      delete ret.changes.before.password;
    }
    if (ret.changes && ret.changes.after) {
      delete ret.changes.after.password;
    }
  }
});

const AuditLogs = mongoose.model('AuditLogs', AuditLogsSchema);
export default AuditLogs;