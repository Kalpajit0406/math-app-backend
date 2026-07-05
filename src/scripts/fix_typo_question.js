/**
 * Script to fix the conditional probability question's typo in DB and shuffle its options.
 */

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Question = require('../models/questionModel');

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function run() {
  console.log('Connecting to database...');
  await connectDB();

  const questionId = '6a39b107e3219b9228584567';
  const q = await Question.findById(questionId);

  if (!q) {
    console.error(`Question with ID ${questionId} not found!`);
    process.exit(1);
  }

  console.log('Original Question Details:');
  console.log(`Question: ${q.question}`);
  console.log(`Options: ${JSON.stringify(q.options)}`);
  console.log(`Correct Answer (old): ${q.correctAnswer}`);

  // Correct the answer
  q.correctAnswer = '$\\frac{4}{7}$';

  // Shuffle options
  q.options = shuffle(q.options);

  console.log('Updated Question Details:');
  console.log(`Options (shuffled): ${JSON.stringify(q.options)}`);
  console.log(`Correct Answer (new): ${q.correctAnswer}`);

  await q.save();
  console.log('✓ Successfully corrected and updated the question in MongoDB.');

  await mongoose.disconnect();
  console.log('Disconnected from database.');
}

run().catch(err => {
  console.error('Failed to fix question:', err);
  process.exit(1);
});
