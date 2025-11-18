import mongoose from 'mongoose';
import crypto from 'crypto';

const passwordResetSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  token: {
    type: String,
    required: true,
    unique: true
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 3600000) // 1 hour from now
  },
  used: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for automatic cleanup of expired tokens
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Static method to create a reset token
passwordResetSchema.statics.createResetToken = async function(userId) {
  // Generate a secure random token
  const token = crypto.randomBytes(32).toString('hex');
  
  // Remove any existing unused tokens for this user
  await this.deleteMany({ userId, used: false });
  
  // Create new reset token
  const resetToken = new this({
    userId,
    token,
    expiresAt: new Date(Date.now() + 3600000) // 1 hour
  });
  
  await resetToken.save();
  return token;
};

// Static method to verify a reset token
passwordResetSchema.statics.verifyResetToken = async function(token) {
  const resetRecord = await this.findOne({
    token,
    used: false,
    expiresAt: { $gt: new Date() }
  }).populate('userId');
  
  return resetRecord;
};

// Static method to mark token as used
passwordResetSchema.statics.markTokenAsUsed = async function(token) {
  await this.updateOne(
    { token },
    { used: true }
  );
};

const PasswordReset = mongoose.model('PasswordReset', passwordResetSchema);

export default PasswordReset;