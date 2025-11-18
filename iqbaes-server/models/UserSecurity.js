import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSecuritySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  password: { type: String, required: true },
  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date },
  lastLogin: { type: Date },
  passwordChangedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  // Additional security fields
  lastLoginIP: { type: String },
  lastLoginUserAgent: { type: String },
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: { type: String },
  recoveryTokens: [{ type: String }],
  sessionTokens: [{
    token: { type: String },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
    ipAddress: { type: String },
    userAgent: { type: String }
  }]
}, { timestamps: true });

// Virtual for checking if account is locked
UserSecuritySchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Constants for account locking
UserSecuritySchema.statics.MAX_LOGIN_ATTEMPTS = 5;
UserSecuritySchema.statics.LOCK_TIME = 2 * 60 * 60 * 1000; // 2 hours

// Increment login attempts and lock account if necessary
UserSecuritySchema.methods.incLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after max attempts
  if (this.loginAttempts + 1 >= this.constructor.MAX_LOGIN_ATTEMPTS && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + this.constructor.LOCK_TIME };
  }
  
  return this.updateOne(updates);
};

// Reset login attempts
UserSecuritySchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 },
    $set: { lastLogin: Date.now() }
  });
};

// Encrypt password using bcrypt before saving
UserSecuritySchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  
  // Use 12 salt rounds for better security
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  
  // Update passwordChangedAt timestamp
  this.passwordChangedAt = new Date();
  next();
});

// Match user entered password to hashed password in database
UserSecuritySchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Check if password was changed after JWT was issued
UserSecuritySchema.methods.changedPasswordAfter = function(JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// Clean up expired session tokens
UserSecuritySchema.methods.cleanExpiredTokens = function() {
  const now = new Date();
  this.sessionTokens = this.sessionTokens.filter(token => 
    token.expiresAt && token.expiresAt > now
  );
  return this.save();
};

UserSecuritySchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    delete ret.twoFactorSecret;
    delete ret.recoveryTokens;
    delete ret.sessionTokens;
  }
});

const UserSecurity = mongoose.model('UserSecurity', UserSecuritySchema);
export default UserSecurity;