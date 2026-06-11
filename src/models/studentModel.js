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
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  language: { type: String, enum: ['Bengali', 'English', 'Both'], required: true },
  fatherName: { type: String, trim: true },
  motherName: { type: String, trim: true },
  studentPhone: { type: String, required: true, unique: true, trim: true },
  guardianPhone: { type: String, required: true, trim: true },
  passwordHash: { type: String, required: true, select: false, minlength: [40, 'Password hash is too short'] },
  passwordChangedAt: { type: Date },
  passwordAlgorithm: { type: String, default: 'bcrypt' },
  failedLoginAttempts: { type: Number, default: 0 },
  lastFailedLoginAt: { type: Date },
  classChangeHistory: [{ type: Date }],
  pendingProfileEdit: {
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
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
      
      const { getClassNoFromId } = require('../utils/classCache');
      if (doc.classId) {
        ret.classNo = getClassNoFromId(doc.classId) || doc._tempClassNo;
      }
      if (doc.pendingProfileEdit && doc.pendingProfileEdit.classId) {
        ret.pendingProfileEdit.classNo = getClassNoFromId(doc.pendingProfileEdit.classId);
      }
      
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

studentSchema.pre('validate', async function(next) {
  const { getClassIdFromNo } = require('../utils/classCache');
  
  const classVal = this._tempClassNo || this.classNo || this._doc?.classNo || (typeof this.get === 'function' ? this.get('classNo') : undefined);
  const resolved = getClassIdFromNo(classVal);
  console.log(`[Student pre-validate] classVal: ${classVal}, classId: ${this.classId}, resolved: ${resolved}, tempClassNo: ${this._tempClassNo}`);
  if (classVal !== undefined && !this.classId) {
    if (resolved) {
      this.classId = resolved;
    }
  }
  
  if (this.pendingProfileEdit && this.pendingProfileEdit.classNo && !this.pendingProfileEdit.classId) {
    const resolved = getClassIdFromNo(this.pendingProfileEdit.classNo);
    if (resolved) {
      this.pendingProfileEdit.classId = resolved;
    }
  }

  if (this.isModified('passwordHash') && this.passwordHash) {
    if (!this.passwordHash.startsWith('$2a$') && !this.passwordHash.startsWith('$2b$') && !this.passwordHash.startsWith('$2y$')) {
      const bcrypt = require('bcrypt');
      this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
      this.passwordChangedAt = new Date();
    }
  }
  const hasEmptyPermissions = !this.permissions || 
    (this.permissions.canAccessExams === false && 
     this.permissions.canAccessTeacherExams === false && 
     this.permissions.canGeneratePractice === false && 
     this.permissions.canReceiveNotifications === false && 
     this.permissions.canViewPremiumAnalytics === false && 
     this.permissions.canAccessLeaderboard === false && 
     this.permissions.canJoinJointEntrance === false);

  if (this.isNew || this.isModified('accountType') || hasEmptyPermissions) {
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

studentSchema.virtual('classNo')
  .get(function() {
    const { getClassNoFromId } = require('../utils/classCache');
    return getClassNoFromId(this.classId) || this._tempClassNo;
  })
  .set(function(val) {
    const { getClassIdFromNo } = require('../utils/classCache');
    this._tempClassNo = Number(val);
    const resolved = getClassIdFromNo(val);
    if (resolved) {
      this.classId = resolved;
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

// Pre-save hook to track passwordChangedAt if modified
studentSchema.pre('save', function(next) {
  if (this.isModified('passwordHash') && this.passwordHash) {
    if (!this.passwordChangedAt) {
      this.passwordChangedAt = new Date();
    }
  }
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('Student', studentSchema);
