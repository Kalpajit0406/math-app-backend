const mongoose = require('mongoose');
const { AccountType, AccountStatus } = require('../utils/constants');

const permissionsSchema = new mongoose.Schema({
  canAccessExams: { type: Boolean, default: false },
  canAccessTeacherExams: { type: Boolean, default: false },
  canGeneratePractice: { type: Boolean, default: false },
  canReceiveNotifications: { type: Boolean, default: false },
  canViewPremiumAnalytics: { type: Boolean, default: false },
  canAccessLeaderboard: { type: Boolean, default: false },
  canJoinJointEntrance: { type: Boolean, default: false }
}, { _id: false });

const studentSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  dateOfBirth: { type: String, trim: true },
  gender: { type: String, enum: ['Male', 'Female', 'Other'] },
  classNo: { type: Number, enum: [9, 10, 11, 12], required: true },
  language: { type: String, enum: ['Bengali', 'English', 'Both'], required: true },
  fatherName: { type: String, trim: true },
  motherName: { type: String, trim: true },
  studentPhone: { type: String, required: true, unique: true, trim: true },
  guardianPhone: { type: String, required: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  passwordChangedAt: { type: Date },
  classChangeHistory: [{ type: Date }],
  pendingProfileEdit: {
    classNo: { type: Number, enum: [9, 10, 11, 12] },
    language: { type: String, enum: ['Bengali', 'English', 'Both'] },
    isJoint: { type: Boolean },
    requestedAt: { type: Date }
  },
  accountType: {
    type: String,
    enum: Object.values(AccountType),
    default: AccountType.NORMAL
  },
  accountStatus: {
    type: String,
    enum: Object.values(AccountStatus),
    default: AccountStatus.PENDING
  },
  permissions: {
    type: permissionsSchema,
    default: () => ({})
  },
  requestAttempts: { type: Number, default: 0 },
  deviceFingerprint: { type: String, trim: true },
  fingerprintHash: { type: String, trim: true },
  lastKnownDevices: [{ type: String, trim: true }],
  jwtVersion: { type: Number, default: 0 }
}, { 
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      ret.id = ret._id;
      ret.fullName = `${ret.firstName} ${ret.lastName}`;
      ret.studentMobile = ret.studentPhone;
      delete ret._id;
      delete ret.__v;
      delete ret.password;
      delete ret.passwordHash;
      return ret;
    }
  },
  toObject: {
    virtuals: true
  }
});

const DEFAULT_PERMISSIONS = {
  TRIAL: {
    canAccessExams: false,
    canAccessTeacherExams: false,
    canGeneratePractice: true,
    canReceiveNotifications: false,
    canViewPremiumAnalytics: false,
    canAccessLeaderboard: false,
    canJoinJointEntrance: false
  },
  NORMAL: {
    canAccessExams: true,
    canAccessTeacherExams: true,
    canGeneratePractice: true,
    canReceiveNotifications: true,
    canViewPremiumAnalytics: false,
    canAccessLeaderboard: true,
    canJoinJointEntrance: false
  },
  JOINT: {
    canAccessExams: true,
    canAccessTeacherExams: true,
    canGeneratePractice: true,
    canReceiveNotifications: true,
    canViewPremiumAnalytics: true,
    canAccessLeaderboard: true,
    canJoinJointEntrance: true
  },
  JOINT_ENTRANCE: {
    canAccessExams: true,
    canAccessTeacherExams: true,
    canGeneratePractice: true,
    canReceiveNotifications: true,
    canViewPremiumAnalytics: true,
    canAccessLeaderboard: true,
    canJoinJointEntrance: true
  },
  PREMIUM: {
    canAccessExams: true,
    canAccessTeacherExams: true,
    canGeneratePractice: true,
    canReceiveNotifications: true,
    canViewPremiumAnalytics: true,
    canAccessLeaderboard: true,
    canJoinJointEntrance: true
  },
  ADMIN: {
    canAccessExams: true,
    canAccessTeacherExams: true,
    canGeneratePractice: true,
    canReceiveNotifications: true,
    canViewPremiumAnalytics: true,
    canAccessLeaderboard: true,
    canJoinJointEntrance: true
  },
  BLOCKED: {
    canAccessExams: false,
    canAccessTeacherExams: false,
    canGeneratePractice: false,
    canReceiveNotifications: false,
    canViewPremiumAnalytics: false,
    canAccessLeaderboard: false,
    canJoinJointEntrance: false
  }
};

studentSchema.pre('validate', function(next) {
  if (this.isModified('accountType') || !this.permissions || Object.keys(this.permissions).length === 0) {
    const type = this.accountType || 'NORMAL';
    const defaults = DEFAULT_PERMISSIONS[type] || DEFAULT_PERMISSIONS.NORMAL;
    this.permissions = { ...defaults };
  }
  if (typeof next === 'function') {
    next();
  }
});

// Virtual for role
studentSchema.virtual('role')
  .get(function() {
    if (this.accountType === 'ADMIN') return 'admin';
    return 'student';
  })
  .set(function(val) {
    if (val === 'admin') {
      this.accountType = 'ADMIN';
    } else if (this.accountType === 'ADMIN') {
      this.accountType = 'NORMAL';
    }
  });

// Virtual for verified
studentSchema.virtual('verified')
  .get(function() {
    return this.accountStatus === 'APPROVED';
  })
  .set(function(val) {
    this.accountStatus = val ? 'APPROVED' : 'PENDING';
  });

// Virtual for isRejected
studentSchema.virtual('isRejected')
  .get(function() {
    return this.accountStatus === 'REJECTED';
  })
  .set(function(val) {
    this.accountStatus = val ? 'REJECTED' : 'PENDING';
  });

// Virtual for trialApproved
studentSchema.virtual('trialApproved')
  .get(function() {
    return this.accountStatus === 'APPROVED' || this.accountType !== 'TRIAL';
  })
  .set(function(val) {
    if (val && this.accountType === 'TRIAL') {
      this.accountStatus = 'APPROVED';
    }
  });

// Virtual for isJoint
studentSchema.virtual('isJoint')
  .get(function() {
    return this.accountType === 'JOINT' || this.accountType === 'JOINT_ENTRANCE';
  })
  .set(function(val) {
    if (val) {
      this.accountType = 'JOINT';
    } else if (this.accountType === 'JOINT' || this.accountType === 'JOINT_ENTRANCE') {
      this.accountType = 'NORMAL';
    }
  });

// Virtual for legacy password field support
studentSchema.virtual('password')
  .get(function() {
    return this.passwordHash;
  })
  .set(function(val) {
    this.passwordHash = val;
  });

// Pre-save hook to enforce secure bcrypt password hashing and track passwordChangedAt
studentSchema.pre('save', async function(next) {
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

module.exports = mongoose.model('Student', studentSchema);
