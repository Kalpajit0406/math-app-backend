const mongoose = require('mongoose');

const responseSchema = new mongoose.Schema(
  {
    questionNumber: {
      type: Number,
      required: [true, "Question number is required"],
    },
    questionId: {
      type: String,
      required: [true, "Question ID is required"],
    },
    selectedOption: {
      type: String,
      default: null,
    },
  }
);

const testResponseSchema = new mongoose.Schema(
  {
    date: {
      type: String,
      required: [true, "Date is required"],
    },
    time: {
      type: String,
      required: [true, "Time is required"],
    },
    studentMobile: {
      type: String,
      required: [true, "Student mobile number is required"],
    },
    testId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TestConfig',
      required: [true, "Test ID is required"],
    },
    responses: {
      type: [responseSchema],
      required: [true, "Test responses are required"],
      validate: {
        validator: function (val) {
          return Array.isArray(val) && val.length > 0;
        },
        message: "At least one response is required",
      },
    },
  },
  { 
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

module.exports = mongoose.model('TestResponse', testResponseSchema);
