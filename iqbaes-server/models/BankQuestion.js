import mongoose from 'mongoose';

const bankQuestionSchema = new mongoose.Schema({
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  question: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['MCQ', 'TF', 'SA', 'Essay'],
    default: 'MCQ'
  },
  options: [{
    type: String,
    required: true
  }],
  correctAnswer: {
    type: Number,
    required: true,
    min: 0
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  },
  category: {
    type: String,
    trim: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  explanation: {
    type: String,
    trim: true
  },
  points: {
    type: Number,
    default: 1,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  usageCount: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for better query performance
bankQuestionSchema.index({ courseId: 1 });
bankQuestionSchema.index({ difficulty: 1 });
bankQuestionSchema.index({ createdBy: 1 });
bankQuestionSchema.index({ category: 1 });
bankQuestionSchema.index({ isActive: 1 });

// Update the updatedAt field before saving
bankQuestionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Virtual for question usage statistics
bankQuestionSchema.virtual('isPopular').get(function() {
  return this.usageCount > 10;
});

// Method to increment usage count
bankQuestionSchema.methods.incrementUsage = function() {
  this.usageCount += 1;
  return this.save();
};

// Transform fields for frontend compatibility
bankQuestionSchema.methods.toJSON = function() {
  const obj = this.toObject();
  // Map backend fields to frontend expectations
  obj.id = obj._id?.toString();
  obj.topic = obj.category; // Map category -> topic
  obj.text = obj.question;  // Map question -> text
  // Clean up Mongo internals
  delete obj._id;
  delete obj.__v;
  return obj;
};

// Static method to find questions by course
bankQuestionSchema.statics.findByCourse = function(courseId, options = {}) {
  const query = { courseId, isActive: true };
  
  if (options.difficulty) {
    query.difficulty = options.difficulty;
  }
  
  if (options.category) {
    query.category = options.category;
  }
  
  return this.find(query).populate('createdBy', 'username email');
};

// Static method to get random questions for exam
bankQuestionSchema.statics.getRandomQuestions = function(courseId, count, difficulty = null) {
  const matchStage = { courseId: new mongoose.Types.ObjectId(courseId), isActive: true };
  
  if (difficulty) {
    matchStage.difficulty = difficulty;
  }
  
  return this.aggregate([
    { $match: matchStage },
    { $sample: { size: count } }
  ]);
};

export const BankQuestion = mongoose.model('BankQuestion', bankQuestionSchema);

export default BankQuestion;