/**
 * Script to randomize option positions for all seeded questions:
 * - Class 11 Probability
 * - Class 12 Probability
 * - Class 12 Relation
 * - Class 12 Function
 * Ensures the correct answer positions are evenly distributed and not skewed.
 * Automatically updates hashes via Mongoose hooks.
 */

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Question = require('../models/questionModel');

// Fisher-Yates Shuffle
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

  const chapters = [
    '6a276d687e1083c17978de7c', // Class 11 Probability
    '6a276d6a7e1083c17978de95', // Class 12 Probability
    '6a276d687e1083c17978de7d', // Class 12 Relation
    '6a276d687e1083c17978de7e'  // Class 12 Function
  ].map(id => new mongoose.Types.ObjectId(id));

  console.log('Fetching questions for target chapters...');
  const questions = await Question.find({ chapterId: { $in: chapters } });
  console.log(`Found ${questions.length} total questions to process.`);

  let updatedCount = 0;
  let missingAnswerCount = 0;

  const distributionBefore = { A: 0, B: 0, C: 0, D: 0 };
  const distributionAfter = { A: 0, B: 0, C: 0, D: 0 };
  const indexToLetter = ['A', 'B', 'C', 'D'];

  for (const q of questions) {
    const originalOptions = q.options;
    const correctAns = q.correctAnswer;

    // Find original index of correct answer
    const originalIndex = originalOptions.indexOf(correctAns);
    if (originalIndex === -1) {
      console.warn(`Warning: Correct answer "${correctAns}" not found in options for question ID: ${q._id}`);
      missingAnswerCount++;
      continue;
    }

    const origLetter = indexToLetter[originalIndex] || 'Unknown';
    distributionBefore[origLetter] = (distributionBefore[origLetter] || 0) + 1;

    // Shuffle options
    let shuffledOptions = shuffle(originalOptions);
    q.options = shuffledOptions;
    
    // Find new index
    const newIndex = shuffledOptions.indexOf(correctAns);
    if (newIndex === -1) {
      console.error(`Error: Correct answer lost after shuffle for question ID: ${q._id}`);
      continue;
    }
    
    const newLetter = indexToLetter[newIndex];
    distributionAfter[newLetter] = (distributionAfter[newLetter] || 0) + 1;

    q.markModified('options');
    await q.save();
    updatedCount++;
  }

  console.log('====================================================');
  console.log('SHUFFLE PROCESS SUMMARY:');
  console.log(`Successfully processed: ${updatedCount} questions`);
  console.log(`Questions with missing answers: ${missingAnswerCount}`);
  console.log('----------------------------------------------------');
  console.log('Correct Answer Position Distribution BEFORE:');
  console.log(` - A (Option 1): ${distributionBefore.A} questions`);
  console.log(` - B (Option 2): ${distributionBefore.B} questions`);
  console.log(` - C (Option 3): ${distributionBefore.C} questions`);
  console.log(` - D (Option 4): ${distributionBefore.D} questions`);
  console.log('----------------------------------------------------');
  console.log('Correct Answer Position Distribution AFTER:');
  console.log(` - A (Option 1): ${distributionAfter.A} questions`);
  console.log(` - B (Option 2): ${distributionAfter.B} questions`);
  console.log(` - C (Option 3): ${distributionAfter.C} questions`);
  console.log(` - D (Option 4): ${distributionAfter.D} questions`);
  console.log('====================================================');

  await mongoose.disconnect();
  console.log('Disconnected from database.');
}

run().catch(err => {
  console.error('Shuffle process failed:', err);
  process.exit(1);
});
