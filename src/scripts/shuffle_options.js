/**
 * Script to randomize option positions for Class 11 and Class 12 Probability questions.
 * Ensures the correct answer position is evenly spread and not skewed (e.g., always A).
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

  const class11ProbChapter = '6a276d687e1083c17978de7c';
  const class12ProbChapter = '6a276d6a7e1083c17978de95';

  const probChapters = [
    new mongoose.Types.ObjectId(class11ProbChapter),
    new mongoose.Types.ObjectId(class12ProbChapter)
  ];

  console.log('Fetching Probability questions...');
  const questions = await Question.find({ chapterId: { $in: probChapters } });
  console.log(`Found ${questions.length} total Probability questions to process.`);

  let updatedCount = 0;
  let missingAnswerCount = 0;

  // Track correct answer index distribution before and after
  const distributionBefore = { A: 0, B: 0, C: 0, D: 0 };
  const distributionAfter = { A: 0, B: 0, C: 0, D: 0 };
  const indexToLetter = ['A', 'B', 'C', 'D'];

  for (const q of questions) {
    const originalOptions = q.options;
    const correctAns = q.correctAnswer;

    // Find original index of correct answer
    const originalIndex = originalOptions.indexOf(correctAns);
    if (originalIndex === -1) {
      console.warn(`Warning: Correct answer "${correctAns}" not found in options for question: "${q.question}"`);
      missingAnswerCount++;
      continue;
    }

    const origLetter = indexToLetter[originalIndex] || 'Unknown';
    distributionBefore[origLetter] = (distributionBefore[origLetter] || 0) + 1;

    // Shuffle options until its position changes (or we just shuffle once, but let's make sure it's shuffled)
    let shuffledOptions = shuffle(originalOptions);
    
    // Update options and mark as modified
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
