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
    minlength: [40, 'Password hash is too short'],
  },
  passwordChangedAt: {
    type: Date,
  },
  passwordAlgorithm: {
    type: String,
    default: 'bcrypt',
  },
  failedLoginAttempts: {
    type: Number,
    default: 0,
  },
  lastFailedLoginAt: {
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

// Pre-validate hook to run password hashing before schema validation
userSchema.pre('validate', async function(next) {
  if (this.isModified('passwordHash') && this.passwordHash) {
    if (!this.passwordHash.startsWith('$2a$') && !this.passwordHash.startsWith('$2b$') && !this.passwordHash.startsWith('$2y$')) {
      const bcrypt = require('bcrypt');
      this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
      this.passwordChangedAt = new Date();
    }
  }
  if (typeof next === 'function') {
    next();
  }
});

// Pre-save hook to track passwordChangedAt if modified
userSchema.pre('save', function(next) {
  if (this.isModified('passwordHash') && this.passwordHash) {
    if (!this.passwordChangedAt) {
      this.passwordChangedAt = new Date();
    }
  }
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('User', userSchema);
