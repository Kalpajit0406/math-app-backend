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
  classNo: {
    type: Number,
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
}, { timestamps: true });

selfAssessmentSessionSchema.index({ token: 1, status: 1 });
selfAssessmentSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Auto-expire from DB

module.exports = mongoose.model('SelfAssessmentSession', selfAssessmentSessionSchema);
