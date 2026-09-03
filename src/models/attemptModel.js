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
  // Per-student shuffled question order, generated once when the attempt is
  // first created and persisted so it stays stable across resumes (app
  // restart, network drop, etc). Stores Question _ids as strings in the
  // order this student should see them. Empty for legacy attempts created
  // before this field existed — clients fall back to the exam's stored order.
  questionOrder: {
    type: [String],
    default: [],
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

// Composite query index for lookups
attemptSchema.index({ userId: 1, examId: 1, endTime: 1 });
// Note: A partial unique index on {userId,examId} where endTime does not exist would
// prevent race-condition duplicate active attempts at DB level, but MongoDB Atlas
// shared clusters reject $exists:false in partialFilterExpression.
// Duplicate prevention is enforced at application level in startAttempt().

attemptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('Attempt', attemptSchema);
