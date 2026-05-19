const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  language: {
    type: String,
    enum: ["Bengali", "English"],
    required: true,
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
    validate: [val => val.length === 4, 'Exactly 4 options are required'],
    required: true,
  },
  question: {
    type: String,
    required: true,
  },
  diagram: {
    type: String,
    default: null,
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

module.exports = mongoose.model('Question', questionSchema);
