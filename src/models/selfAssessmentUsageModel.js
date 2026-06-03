const mongoose = require('mongoose');

const selfAssessmentUsageSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true,
  },
  date: {
    type: String, // Format: YYYY-MM-DD
    required: true,
    index: true,
  },
  assessmentCount: {
    type: Number,
    default: 0,
  },
  lastAssessmentAt: {
    type: Date,
    default: Date.now,
  }
}, { timestamps: true });

// Enforce unique constraints on compound key
selfAssessmentUsageSchema.index({ studentId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('SelfAssessmentUsage', selfAssessmentUsageSchema);
