const mongoose = require('mongoose');

const importItemSchema = new mongoose.Schema({
  importJobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ImportJob',
    required: true,
    index: true,
  },
  sourceIndex: {
    type: Number,
    default: 0,
  },
  question: {
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
  language: {
    type: String,
    enum: ["Bengali", "English", "Both"],
    default: "English",
  },
  className: {
    type: String,
  },
  chapterName: {
    type: String,
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
  },
  chapterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chapter',
  },
  diagram: {
    type: String,
    default: null,
  },
  rawContent: {
    type: String,
    default: '',
  },
  normalizedContent: {
    type: String,
    default: '',
  },
  parserConfidence: {
    type: Number,
    default: 1.0,
  },
  status: {
    type: String,
    enum: ['pending_verification', 'saved', 'rejected'],
    default: 'pending_verification',
    index: true,
  },
  warnings: {
    type: [String],
    default: [],
  },
  errors: {
    type: [String],
    default: [],
  },
  questionHash: {
    type: String,
    index: true,
  },
  contentHash: {
    type: String,
    index: true,
  },
  duplicateFound: {
    type: Boolean,
    default: false,
  },
  duplicateQuestionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    default: null,
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      ret.id = ret._id;
      delete ret.__v;
      return ret;
    }
  },
  toObject: {
    virtuals: true
  }
});

// Configure indexes on importItemSchema
importItemSchema.index({ importJobId: 1, status: 1 });

// Compatibility virtuals
importItemSchema.virtual('jobId')
  .get(function() {
    return this.importJobId;
  })
  .set(function(val) {
    this.importJobId = val;
  });

importItemSchema.virtual('questionText')
  .get(function() {
    return this.question;
  })
  .set(function(val) {
    this.question = val;
  });

importItemSchema.virtual('classNo')
  .get(function() {
    return parseInt(this.className, 10) || 12;
  })
  .set(function(val) {
    this.className = String(val || 12);
  });

importItemSchema.virtual('duplicateInfo')
  .get(function() {
    return {
      detected: this.duplicateFound || false,
      similarity: this.duplicateFound ? 1.0 : 0.0,
      rating: this.duplicateFound ? 'Strong duplicate warning' : 'Allow normally',
      existingQuestionId: this.duplicateQuestionId || null
    };
  })
  .set(function(val) {
    if (val) {
      this.duplicateFound = !!val.detected;
      this.duplicateQuestionId = val.existingQuestionId || null;
    }
  });

module.exports = mongoose.model('ImportItem', importItemSchema);

