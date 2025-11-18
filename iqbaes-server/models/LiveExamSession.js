import mongoose from 'mongoose';

const LiveExamSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  startTime: { type: Date, required: true, default: Date.now },
  lastHeartbeat: { type: Date, required: true, default: Date.now },
  progressCurrent: { type: Number, default: 0 },
  progressTotal: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'submitted', 'expired', 'abandoned', 'flagged'], default: 'active' },
  violationsCount: { type: Number, default: 0 },
  ipAddress: { type: String },
  userAgent: { type: String },
  resolvedAlertIds: [{ type: String }], // Track resolved alert IDs to prevent regeneration
}, { timestamps: true });

// Ensure one active session per user-exam
LiveExamSessionSchema.index({ userId: 1, examId: 1, status: 1 });
LiveExamSessionSchema.index({ lastHeartbeat: -1 });

LiveExamSessionSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
  }
});

const LiveExamSession = mongoose.model('LiveExamSession', LiveExamSessionSchema);
export default LiveExamSession;

