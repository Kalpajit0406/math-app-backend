const mongoose = require('mongoose');

const authSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },
  refreshTokenHash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  deviceFingerprint: {
    type: String,
    required: true,
    index: true
  },
  deviceName: {
    type: String,
    default: 'Unknown Device'
  },
  platform: {
    type: String,
    default: 'unknown'
  },
  ipAddress: {
    type: String,
    default: '0.0.0.0'
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  revoked: {
    type: Boolean,
    default: false,
    index: true
  },
  revokedAt: {
    type: Date
  },
  lastActivityAt: {
    type: Date,
    default: Date.now
  }
}, { 
  timestamps: true 
});

// TTL index to automatically clean up sessions after they expire
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AuthSession', authSessionSchema);
