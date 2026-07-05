require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Question = require('../models/questionModel');

const run = async () => {
  try {
    await connectDB();
    const questions = await Question.find({}).limit(5);
    questions.forEach(q => {
      console.log('---');
      console.log('ID:', q._id);
      console.log('Question:', q.question);
      console.log('Options:', q.options);
      console.log('CorrectAnswer:', q.correctAnswer);
    });
    await mongoose.connection.close();
  } catch (err) {
    console.error(err);
  }
};
run();
