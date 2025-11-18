import mongoose from 'mongoose';

const UserEnrollmentsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  enrolledAt: {
    type: Date,
    default: Date.now
  },
  enrolledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // Admin or lecturer who enrolled the student
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'dropped', 'suspended'],
    default: 'active'
  },
  completedAt: {
    type: Date
  },
  finalGrade: {
    type: Number,
    min: 0,
    max: 100
  },
  // Progress tracking
  examsCompleted: {
    type: Number,
    default: 0
  },
  totalExams: {
    type: Number,
    default: 0
  },
  averageScore: {
    type: Number,
    default: 0
  },
  // Additional metadata
  notes: {
    type: String
  },
  lastActivity: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Compound index to ensure unique enrollment per user-course pair
UserEnrollmentsSchema.index({ userId: 1, courseId: 1 }, { unique: true });

// Index for efficient queries
UserEnrollmentsSchema.index({ userId: 1, status: 1 });
UserEnrollmentsSchema.index({ courseId: 1, status: 1 });
UserEnrollmentsSchema.index({ enrolledAt: 1 });

// Virtual for completion percentage
UserEnrollmentsSchema.virtual('completionPercentage').get(function() {
  if (this.totalExams === 0) return 0;
  return Math.round((this.examsCompleted / this.totalExams) * 100);
});

// Method to update progress
UserEnrollmentsSchema.methods.updateProgress = function(examScore) {
  this.examsCompleted += 1;
  
  // Recalculate average score
  const totalScore = (this.averageScore * (this.examsCompleted - 1)) + examScore;
  this.averageScore = Math.round(totalScore / this.examsCompleted);
  
  this.lastActivity = new Date();
  
  // Auto-complete if all exams are done
  if (this.examsCompleted >= this.totalExams && this.status === 'active') {
    this.status = 'completed';
    this.completedAt = new Date();
    this.finalGrade = this.averageScore;
  }
  
  return this.save();
};

// Static method to get user's active enrollments
UserEnrollmentsSchema.statics.getActiveEnrollments = function(userId) {
  return this.find({ userId, status: 'active' })
    .populate('courseId', 'title description')
    .sort({ enrolledAt: -1 });
};

// Static method to get course enrollments
UserEnrollmentsSchema.statics.getCourseEnrollments = function(courseId, status = null) {
  const query = { courseId };
  if (status) query.status = status;
  
  return this.find(query)
    .populate('userId', 'name username')
    .sort({ enrolledAt: -1 });
};

UserEnrollmentsSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
  }
});

const UserEnrollments = mongoose.model('UserEnrollments', UserEnrollmentsSchema);
export default UserEnrollments;