import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  userRole: {
    type: String,
    enum: ['student', 'lecturer', 'admin'],
    required: true
  },
  type: {
    type: String,
    enum: ['bug', 'feature_request', 'general_feedback', 'technical_issue'],
    required: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'resolved', 'closed'],
    default: 'open'
  },
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    maxlength: 2000
  },
  stepsToReproduce: {
    type: String,
    maxlength: 1000
  },
  expectedBehavior: {
    type: String,
    maxlength: 500
  },
  actualBehavior: {
    type: String,
    maxlength: 500
  },
  browserInfo: {
    type: String,
    maxlength: 200
  },
  screenResolution: {
    type: String,
    maxlength: 50
  },
  attachments: [{
    type: String
  }],
  adminResponse: {
    type: String,
    maxlength: 1000
  },
  // Add comments array for progress updates
  comments: [{
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    adminName: {
      type: String,
      required: true
    },
    message: {
      type: String,
      required: true,
      maxlength: 1000
    },
    type: {
      type: String,
      enum: ['progress_update', 'status_change', 'admin_response'],
      default: 'progress_update'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedAt: {
    type: Date
  },
  // Notification tracking fields
  hasUnreadResponse: {
    type: Boolean,
    default: false
  },
  lastResponseAt: {
    type: Date
  },
  notificationSent: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for efficient querying
feedbackSchema.index({ status: 1, priority: -1, createdAt: -1 });
feedbackSchema.index({ userId: 1, createdAt: -1 });
feedbackSchema.index({ type: 1, status: 1 });

const Feedback = mongoose.model('Feedback', feedbackSchema);

export default Feedback;