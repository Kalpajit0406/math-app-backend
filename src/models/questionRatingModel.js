const mongoose = require('mongoose');

const questionRatingSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    difficulty: {
      type: Number,
      enum: [1, 2, 3, 4, 5], // 1=very easy, 5=very hard
      required: true,
    },
    clarity: {
      type: Number,
      enum: [1, 2, 3, 4, 5], // 1=confusing, 5=very clear
    },
    comment: {
      type: String,
      maxlength: 500,
    },
    isCorrectAnswer: Boolean, // Did student get it right?
    timeSpent: Number, // In seconds
  },
  { timestamps: true }
);

// Compound index to prevent duplicate ratings
questionRatingSchema.index({ questionId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('QuestionRating', questionRatingSchema);
