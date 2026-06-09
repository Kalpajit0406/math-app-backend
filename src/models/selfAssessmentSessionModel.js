const mongoose = require('mongoose');

const selfAssessmentSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true,
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
  },
  token: {
    type: String,
    required: true,
    index: true,
  },
  deviceFingerprint: {
    type: String,
  },
  questionPool: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
  }],
  answersSubmitted: {
    type: Map,
    of: String,
    default: new Map(),
  },
  correctAnswersCount: {
    type: Number,
    default: 0,
  },
  currentQuestionIndex: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'terminated'],
    default: 'active',
  },
  lastActiveAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    required: true,
  }
}, { 
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      const { getClassNoFromId } = require('../utils/classCache');
      if (doc.classId) {
        ret.classNo = getClassNoFromId(doc.classId) || doc._tempClassNo;
      }
      return ret;
    }
  },
  toObject: {
    virtuals: true
  }
});

selfAssessmentSessionSchema.virtual('classNo')
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

selfAssessmentSessionSchema.pre('validate', async function (next) {
  const { getClassIdFromNo } = require('../utils/classCache');
  
  const classVal = this._tempClassNo || this.classNo;
  if (classVal !== undefined && !this.classId) {
    const resolved = getClassIdFromNo(classVal);
    if (resolved) {
      this.classId = resolved;
    }
  }
  if (typeof next === 'function') {
    next();
  }
});

selfAssessmentSessionSchema.index({ token: 1, status: 1 });
selfAssessmentSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Auto-expire from DB

module.exports = mongoose.model('SelfAssessmentSession', selfAssessmentSessionSchema);
