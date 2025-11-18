import mongoose from 'mongoose';

const CourseSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
  },
}, { timestamps: true });

// Helper to convert _id to id
CourseSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
  }
});

const Course = mongoose.model('Course', CourseSchema);
export default Course;
