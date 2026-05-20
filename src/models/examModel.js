const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['mcq', 'numeric'],
    required: true,
  },
  questionText: {
    type: String,
    required: true,
  },
  options: [String], // Array of strings for MCQ
  correctAnswer: {
    type: String,
    required: true,
  },
});

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
  questions: [questionSchema],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
  },
}, { 
  timestamps: true,
  toJSON: {
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
  }
});

module.exports = mongoose.model('Exam', examSchema);
