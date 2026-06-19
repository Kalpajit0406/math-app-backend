const mongoose = require('mongoose');
const { AntiCheatSeverity } = require('../utils/constants');

const responseSchema = new mongoose.Schema({
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  userAnswer: String,
  isCorrect: Boolean,
});

const violationSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
  },
  severity: {
    type: String,
    enum: Object.values(AntiCheatSeverity),
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const attemptSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
  },
  examId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: true,
  },
  score: {
    type: Number,
    default: 0,
  },
  marksObtained: {
    type: Number,
    default: 0,
  },
  evaluationSummary: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  responses: [responseSchema],
  violations: [violationSchema],
  isAutoSubmitted: {
    type: Boolean,
    default: false,
  },
  autoSubmitReason: String,
  emulatorDetected: {
    type: Boolean,
    default: false,
  },
  rootDetected: {
    type: Boolean,
    default: false,
  },
  startTime: {
    type: Date,
    default: Date.now,
  },
  endTime: Date,
}, { 
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

attemptSchema.index({ userId: 1, examId: 1, endTime: 1 });
attemptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('Attempt', attemptSchema);
