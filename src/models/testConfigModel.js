const mongoose = require('mongoose');

const testConfigSchema = new mongoose.Schema(
  {
    date: {
      type: String,
      required: [true, "Date is required"],
    },
    time: {
      type: String,
      required: [true, "Time is required"],
    },
    classNo: {
      type: Number,
      enum: [9, 10, 11, 12],
      required: [true, "Class number must be 9, 10, 11 or 12"],
    },
    language: {
      type: String,
      enum: ["Bengali", "English"],
      required: [true, "Preferred language is required"],
    },
    totalMarks: {
      type: Number,
      required: [true, "Total marks is required"],
      min: [1, "Total marks must be greater than 0"],
    },
    marksPQ: {
      type: Number,
      required: [true, "Marks per question is required"],
      min: [0, "Marks per question cannot be negative"],
    },
    timePQ: {
      type: Number,
      required: [true, "Time per question is required"],
      min: [1, "Time per question must be at least 1 second"],
    },
    negativeMarksPQ: {
      type: Number,
      required: [true, "Negative marks per question is required"],
      min: [0, "Negative marks cannot be negative"],
    },
    chapters: {
      type: [String],
      required: [true, "Chapters are required"],
      validate: {
        validator: function (val) {
          return Array.isArray(val) && val.length > 0;
        },
        message: "At least one chapter is required",
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

module.exports = mongoose.model('TestConfig', testConfigSchema);
