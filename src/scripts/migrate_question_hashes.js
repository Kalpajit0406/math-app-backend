/**
 * Database Hash Migration Script
 * Scans all existing questions, normalizes their sentences,
 * computes the SHA-256 question-only hash, computes the contentHash,
 * and backfills the database. Then rebuilds indexes safely.
 */

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Question = require('../models/questionModel');
const { QuestionDuplicateDetector } = require('../services/questionDuplicateDetector');
const { ensureIndexes } = require('../utils/indexes');

async function runMigration() {
  console.log('====================================================');
  console.log('STARTING EXISTING DATABASE HASH MIGRATION');
  console.log('====================================================');

  const start = Date.now();
  let totalScanned = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  try {
    // 1. Fetch all questions from the database
    const questions = await Question.find({});
    totalScanned = questions.length;
    console.log(`Retrieved ${totalScanned} questions from database.`);

    // 2. Loop through and backfill hashes
    for (const q of questions) {
      if (!q.question) {
        totalSkipped++;
        continue;
      }

      const normalized = QuestionDuplicateDetector.normalize(q.question);
      const questionHash = QuestionDuplicateDetector.hash(normalized);
      
      const contentHash = QuestionDuplicateDetector.contentHash(q);

      // Only update if hashes are missing or incorrect
      if (q.questionHash !== questionHash || q.contentHash !== contentHash) {
        q.questionHash = questionHash;
        q.contentHash = contentHash;
        await q.save();
        totalUpdated++;
      } else {
        totalSkipped++;
      }
    }

    console.log('Rebuilding database indexes safely...');
    await ensureIndexes(mongoose);

    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log('====================================================');
    console.log('MIGRATION COMPLETED SUCCESSFULLY');
    console.log('====================================================');
    console.log(`Total Scanned: ${totalScanned}`);
    console.log(`Total Updated: ${totalUpdated}`);
    console.log(`Total Skipped: ${totalSkipped}`);
    console.log(`Duration:      ${duration} seconds`);
    console.log('====================================================\n');

  } catch (error) {
    console.error('Migration failed:', error.message);
  }
}

async function run() {
  try {
    await connectDB();
    await runMigration();
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('Database connection or execution failed:', err);
    process.exit(1);
  }
}

run();
