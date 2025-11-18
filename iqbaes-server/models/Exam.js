import mongoose from 'mongoose';
import { QuestionSchema } from './Question.js';

const ExamSchema = new mongoose.Schema({
  title: { type: String, required: true },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
  },
  durationMinutes: { type: Number, required: true },
  questionCount: { type: Number, required: true },
  questions: [QuestionSchema], // Embed the questions
  availableFrom: { type: Date },
  availableUntil: { type: Date },
}, { timestamps: true });

ExamSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
  }
});

const Exam = mongoose.model('Exam', ExamSchema);
export default Exam;
