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
  chapters: {
    type: [String],
    default: [],
  },
  questionIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
  },
}, { 
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      ret.id = ret._id;
      delete ret.__v;
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

// Auto-populate helper middlewares
examSchema.pre('find', function() {
  this.populate('questions');
});

examSchema.pre('findOne', function() {
  this.populate('questions');
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
