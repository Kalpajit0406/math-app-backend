const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  language: {
    type: String,
    enum: ["Bengali", "English", "Both"],
    required: [true, "Preferred language is required"],
  },
  chapterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chapter',
    required: true,
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
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
    unique: true,
    sparse: true,
    index: true,
  },
  formulaKeywords: {
    type: [String],
    default: [],
    index: true,
  },
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' }
}, { 
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      ret.id = ret._id;
      const { getClassNoFromId } = require('../utils/classCache');
      if (doc.classId) {
        ret.classNo = getClassNoFromId(doc.classId) || doc._tempClassNo;
      }
      delete ret.__v;
      return ret;
    }
  },
  toObject: {
    virtuals: true
  }
});

// Virtual for chapter name
questionSchema.virtual('chapter')
  .get(function() {
    if (this.chapterId && this.chapterId.chapterName) {
      return this.chapterId.chapterName;
    }
    return this._tempChapterName || '';
  })
  .set(function(val) {
    this._tempChapterName = val;
  });

// Virtual for questionText (mapping to question)
questionSchema.virtual('questionText')
  .get(function() {
    return this.question;
  })
  .set(function(val) {
    this.question = val;
  });

// Virtual for question type (MCQ vs Numeric)
questionSchema.virtual('type')
  .get(function() {
    return (this.options && this.options.length > 0) ? 'mcq' : 'numeric';
  });

questionSchema.virtual('classNo')
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

questionSchema.pre('validate', async function (next) {
  const { getClassIdFromNo } = require('../utils/classCache');
  
  const classVal = this._tempClassNo || this.classNo;
  if (classVal !== undefined && !this.classId) {
    const resolved = getClassIdFromNo(classVal);
    if (resolved) {
      this.classId = resolved;
    }
  }

  const chapterName = this.chapter;
  if (chapterName && this.classId && !this.chapterId) {
    try {
      const Chapter = mongoose.model('Chapter');
      const { normalizeChapterName } = require('../utils/chapterNormalization');
      const normalized = normalizeChapterName(chapterName);
      
      let chap = await Chapter.findOne({ classId: this.classId, normalizedChapterName: normalized });
      if (!chap) {
        chap = await Chapter.create({
          classId: this.classId,
          chapterName: chapterName,
        });
      }
      this.chapterId = chap._id;
    } catch (err) {
      if (typeof next === 'function') {
        return next(err);
      }
      throw err;
    }
  }
  if (typeof next === 'function') {
    next();
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

// Pre-find hook to automatically filter out soft-deleted questions
questionSchema.pre(/^find/, function() {
  this.where({ isDeleted: { $ne: true } });
});

// Auto-populate chapter details
questionSchema.pre('find', function() {
  this.populate('chapterId');
});

questionSchema.pre('findOne', function() {
  this.populate('chapterId');
});

// Indexes for fast querying
questionSchema.index({ classId: 1, language: 1 });
questionSchema.index({ chapterId: 1 });
questionSchema.index({ question: 'text', formulaKeywords: 'text' }, { weights: { question: 10, formulaKeywords: 5 }, name: 'QuestionTextSearchIndex' });

module.exports = mongoose.model('Question', questionSchema);
