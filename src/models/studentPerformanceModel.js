const mongoose = require('mongoose');

const performanceHistorySchema = new mongoose.Schema({
  testId: { type: String, required: true },
  testType: { type: String, enum: ['exam', 'self-assessment'], required: true },
  score: { type: Number, required: true },
  totalQuestions: { type: Number, required: true },
  percentage: { type: Number, required: true },
  takenAt: { type: Date, default: Date.now }
});

const studentPerformanceSchema = new mongoose.Schema({
  studentMobile: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  lastTestPercentage: {
    type: Number,
    required: true,
    default: 0,
  },
  totalTestsTaken: {
    type: Number,
    required: true,
    default: 0,
  },
  averagePercentage: {
    type: Number,
    required: true,
    default: 0,
  },
  testHistory: [performanceHistorySchema],
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

module.exports = mongoose.model('StudentPerformance', studentPerformanceSchema);
