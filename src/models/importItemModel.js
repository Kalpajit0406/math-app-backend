const mongoose = require('mongoose');

const importItemSchema = new mongoose.Schema({
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ImportJob',
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['pending_verification', 'saved', 'rejected'],
    default: 'pending_verification',
    index: true,
  },
  questionText: {
    type: String,
    required: true,
  },
  options: {
    type: [String],
    validate: {
      validator: function (val) {
        return Array.isArray(val) && val.length === 4;
      },
      message: "Exactly 4 options are required",
    },
    required: true,
  },
  correctAnswer: {
    type: String,
    required: true,
  },
  explanation: {
    type: String,
    default: '',
  },
  classNo: {
    type: Number,
    required: true,
  },
  chapterName: {
    type: String,
    required: true,
  },
  language: {
    type: String,
    enum: ["Bengali", "English", "Both"],
    default: "English",
  },
  duplicateInfo: {
    detected: { type: Boolean, default: false },
    similarity: { type: Number, default: 0 },
    rating: { type: String, default: 'Allow normally' },
    existingQuestionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', default: null }
  },
  errorMessage: {
    type: String,
  },
  rawItemData: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  }
}, {
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      ret.id = ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

module.exports = mongoose.model('ImportItem', importItemSchema);
