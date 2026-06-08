const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
  title: {
    type: String,
    default: '',
  },
  duration: {
    type: Number,
    default: 0,
  },
  date: {
    type: String,
    default: '',
  },
  time: {
    type: String,
    default: '',
  },
  classNo: {
    type: Number,
  },
  language: {
    type: String,
    enum: ['Bengali', 'English', 'Both'],
  },
  totalQuestions: {
    type: Number,
    default: 0,
  },
  totalTime: {
    type: Number,
    default: 0,
  },
  negativeMarking: {
    type: Number,
    default: 0.0,
  },
  marksPerQuestion: {
    type: Number,
    default: 1.0,
  },
  chapterIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chapter',
  }],
  questionIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
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
      delete ret.__v;
      if (ret.chapterIds) {
        ret.chapters = ret.chapterIds.map(ch => {
          if (ch && typeof ch === 'object' && ch.chapterName) {
            return ch.chapterName;
          }
          return ch.toString();
        });
      } else {
        ret.chapters = ret.chapters || [];
      }
      if (ret.questions) {
        ret.questions = ret.questions.map(q => {
          q.id = q._id;
          return q;
        });
      }
      return ret;
    }
  },
  toObject: {
    virtuals: true
  }
});

// Virtual populate questions from Question collection
examSchema.virtual('questions', {
  ref: 'Question',
  localField: 'questionIds',
  foreignField: '_id'
});

// Virtual getter/setter for chapters
examSchema.virtual('chapters')
  .get(function() {
    if (this.chapterIds && this.chapterIds.length > 0) {
      return this.chapterIds.map(ch => {
        if (ch && typeof ch === 'object' && ch.chapterName) {
          return ch.chapterName;
        }
        return ch.toString();
      });
    }
    return this._tempChapters || [];
  })
  .set(function(val) {
    this._tempChapters = val;
  });

// Pre-validate hook to resolve chapters array of strings to chapterIds
examSchema.pre('validate', async function (next) {
  if (this._tempChapters && Array.isArray(this._tempChapters) && this._tempChapters.length > 0) {
    try {
      const { resolveChapterIds } = require('../utils/chapterNormalization');
      const resolved = await resolveChapterIds(this.classNo || 10, this._tempChapters);
      this.chapterIds = resolved;
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

// Pre-find hook to automatically filter out soft-deleted exams
examSchema.pre(/^find/, function() {
  this.where({ isDeleted: { $ne: true } });
});

// Auto-populate helper middlewares
examSchema.pre('find', function() {
  this.populate('questions').populate('chapterIds');
});

examSchema.pre('findOne', function() {
  this.populate('questions').populate('chapterIds');
});

// Attach `.id()` method to populated questions array for compatibility with Mongoose DocumentArray
function attachIdHelper(doc) {
  if (doc && doc.questions) {
    doc.questions.id = function(id) {
      if (!id) return null;
      const idStr = id.toString();
      return this.find(q => q._id && q._id.toString() === idStr);
    };
  }
}

examSchema.post('find', function(docs) {
  if (Array.isArray(docs)) {
    docs.forEach(attachIdHelper);
  }
});

examSchema.post('findOne', function(doc) {
  attachIdHelper(doc);
});

examSchema.post('save', function(doc) {
  attachIdHelper(doc);
});

module.exports = mongoose.model('Exam', examSchema);
