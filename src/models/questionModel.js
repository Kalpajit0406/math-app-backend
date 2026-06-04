const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  language: {
    type: String,
    enum: ["Bengali", "English", "Both"],
    required: [true, "Preferred language is required"],
  },
  chapter: {
    type: String,
    required: true,
  },
  classNo: {
    type: Number,
    required: true,
  },
  correctAnswer: {
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
  question: {
    type: String,
    required: true,
  },
    diagram: {
      type: String,
      default: null,
      validate: {
        validator: function (url) {
          if (url === null || url === '') return true;
          return /^https?:\/\//i.test(url) || /^\/?public\//.test(url);
        },
        message: "Invalid diagram URL or path format",
      },
    },
    questionHash: {
      type: String,
      index: true,
    },
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

  questionSchema.pre('save', function (next) {
    if (this.isModified('question') && this.question) {
      const { normalizeQuestion, generateHash } = require('../services/questionDuplicateDetector');
      const normalized = normalizeQuestion(this.question);
      this.questionHash = generateHash(normalized);
    }
    if (next && typeof next === 'function') {
      next();
    }
  });

  questionSchema.index({ classNo: 1, language: 1, chapter: 1 });

module.exports = mongoose.model('Question', questionSchema);
