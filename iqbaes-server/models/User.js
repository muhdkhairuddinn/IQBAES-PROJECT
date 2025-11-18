import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  role: {
    type: String,
    enum: ['student', 'lecturer', 'admin'],
    required: true,
  },
  // Profile information
  email: { type: String, unique: true, sparse: true },
  profilePicture: { type: String },
  bio: { type: String, maxlength: 500 },
  department: { type: String },
  studentId: { type: String, unique: true, sparse: true },
  employeeId: { type: String, unique: true, sparse: true },
  // Contact information
  phone: { type: String },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  // Academic information
  academicYear: { type: String },
  major: { type: String },
  gpa: { type: Number, min: 0, max: 4.0 },
  // Preferences
  preferences: {
    language: { type: String, default: 'en' },
    timezone: { type: String, default: 'UTC' },
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      push: { type: Boolean, default: true }
    },
    theme: { type: String, enum: ['light', 'dark'], default: 'light' }
  }
}, { timestamps: true });

// Virtual for full name display
UserSchema.virtual('fullName').get(function() {
  return this.name;
});

// Virtual for display identifier (student ID or employee ID)
UserSchema.virtual('displayId').get(function() {
  return this.studentId || this.employeeId || this.username;
});



// Method to get user's active enrollments
UserSchema.methods.getActiveEnrollments = function() {
  const UserEnrollments = mongoose.model('UserEnrollments');
  return UserEnrollments.getActiveEnrollments(this._id);
};

// Method to check if user is enrolled in a course
UserSchema.methods.isEnrolledInCourse = async function(courseId) {
  const UserEnrollments = mongoose.model('UserEnrollments');
  const enrollment = await UserEnrollments.findOne({
    userId: this._id,
    courseId: courseId,
    status: 'active'
  });
  return !!enrollment;
};

// Method to get user's security info
UserSchema.methods.getSecurityInfo = function() {
  const UserSecurity = mongoose.model('UserSecurity');
  return UserSecurity.findOne({ userId: this._id });
};

// Helper to convert _id to id and hide sensitive data
UserSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    delete ret.password;
    // Keep other fields visible for profile management
  }
});

// Static method to find users by role
UserSchema.statics.findByRole = function(role) {
  return this.find({ role }).select('-password');
};

// Static method to search users
UserSchema.statics.searchUsers = function(searchTerm, role = null) {
  const query = {
    $or: [
      { name: { $regex: searchTerm, $options: 'i' } },
      { username: { $regex: searchTerm, $options: 'i' } },
      { email: { $regex: searchTerm, $options: 'i' } },
      { studentId: { $regex: searchTerm, $options: 'i' } },
      { employeeId: { $regex: searchTerm, $options: 'i' } }
    ]
  };
  
  if (role) {
    query.role = role;
  }
  
  return this.find(query).select('-password');
};

const User = mongoose.model('User', UserSchema);
export default User;
