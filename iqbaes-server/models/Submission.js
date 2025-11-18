import mongoose from 'mongoose';
import { QuestionSchema } from './Question.js';

const UserAnswerSchema = new mongoose.Schema({
  questionId: { type: String, required: true },
  answer: { type: mongoose.Schema.Types.Mixed },
}, { _id: false });

const ResultSchema = new mongoose.Schema({
  question: QuestionSchema,
  userAnswer: UserAnswerSchema,
  isCorrect: { type: Boolean, required: true },
  pointsAwarded: { type: Number, required: true },
  gradingJustification: { type: String },
  lecturerOverridePoints: { type: Number },
  lecturerFeedback: { type: String },
}, { _id: false });

const SubmissionSchema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  totalPointsAwarded: { type: Number, required: true },
  totalPointsPossible: { type: Number, required: true },
  submittedAt: { type: Date, default: Date.now },
  results: [ResultSchema],
  // Retake functionality
  attemptNumber: { type: Number, default: 1 },
  isRetakeAllowed: { type: Boolean, default: false },
  retakeAllowedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  retakeAllowedAt: { type: Date },
  retakeRevokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  retakeRevokedAt: { type: Date },
  maxAttempts: { type: Number, default: 1 },
  // Placeholder flag - marks submissions created only for retake permission tracking
  // These should NOT appear in exam history until the student actually takes the exam
  isPlaceholder: { type: Boolean, default: false },
  // Flagging/Invalidation functionality
  flagged: { type: Boolean, default: false },
  flagReason: { type: String },
  flaggedAt: { type: Date },
  flaggedBy: { type: String },
}, { timestamps: true });

SubmissionSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    // CRITICAL: Set id field from _id before deleting _id
    // This ensures the frontend always has a consistent id field to use
    ret.id = doc._id?.toString() || doc._id;
    delete ret._id;
    delete ret.__v;
    // IMPORTANT: Ensure flagged fields are always included in JSON output
    // This prevents the flagged field from being omitted if it's false
    ret.flagged = doc.flagged !== undefined ? doc.flagged : false;
    ret.flagReason = doc.flagReason || null;
    ret.flaggedAt = doc.flaggedAt || null;
    ret.flaggedBy = doc.flaggedBy || null;
    // IMPORTANT: Ensure isPlaceholder field is always included in JSON output
    // This prevents the isPlaceholder field from being omitted if it's false
    ret.isPlaceholder = doc.isPlaceholder !== undefined ? doc.isPlaceholder : false;
  }
});

const Submission = mongoose.model('Submission', SubmissionSchema);
export default Submission;