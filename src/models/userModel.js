const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  passwordHash: {
    type: String,
    required: true,
    select: false,
  },
  passwordChangedAt: {
    type: Date,
  },
  role: {
    type: String,
    enum: ['student', 'teacher'],
    default: 'student',
  },
}, { 
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      delete ret.password;
      delete ret.passwordHash;
      return ret;
    }
  }
});

// Virtual for legacy password field support
userSchema.virtual('password')
  .get(function() {
    return this.passwordHash;
  })
  .set(function(val) {
    this.passwordHash = val;
  });

// Pre-save hook to enforce secure bcrypt password hashing and track passwordChangedAt
userSchema.pre('save', async function(next) {
  if (this.isModified('passwordHash') && this.passwordHash) {
    // Only hash if it's not already a bcrypt hash
    if (!this.passwordHash.startsWith('$2a$') && !this.passwordHash.startsWith('$2b$') && !this.passwordHash.startsWith('$2y$')) {
      const bcrypt = require('bcrypt');
      this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
    }
    this.passwordChangedAt = new Date();
  }
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('User', userSchema);
