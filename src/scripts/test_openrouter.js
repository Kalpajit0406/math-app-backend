'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const connectDB = require('../config/db');

// Load Mongoose models to register schemas
const Class = require('../models/classModel');
const Chapter = require('../models/chapterModel');

const { OpenRouterExtractionService } = require('../services/openRouterExtractionService');

const testSetDir = 'C:\\Users\\kalpa\\Downloads\\test set';
const filename = 'Fail_1.jpeg';

async function run() {
  console.log('--- RUNNING OPENROUTER GEMMA 4 EXTRACTION TEST ---');
  console.log('Connecting to MongoDB...');
  await connectDB();
  console.log('Database connected successfully.');

  const filePath = path.join(testSetDir, filename);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`\n==========================================`);
  console.log(`Processing with OpenRouter: ${filename}`);
  console.log(`==========================================`);

  try {
    const buffer = fs.readFileSync(filePath);
    const mime = 'image/jpeg';

    const startTime = Date.now();
    const results = await OpenRouterExtractionService.extractFromBuffer(buffer, mime, 12, 'General');
    console.log(`Finished in ${Date.now() - startTime}ms. Found ${results.length} questions.`);

    results.forEach((q, i) => {
      console.log(`\n--- Question ${i + 1} (Q# ${q.questionNumber || 'N/A'}) ---`);
      console.log(`Valid: ${q.isValid}`);
      console.log(`Confidence: ${q.confidence}`);
      console.log(`Validation Errors:`, q.validationErrors || []);
      console.log(`Text: ${q.questionText}`);
      console.log(`Options:`, q.options);
      console.log(`Correct: Option ${q.correctOption} (${q.correctAnswer})`);
      console.log(`Language: ${q.language}`);
    });

  } catch (err) {
    console.error(`Failed to process ${filename}:`, err);
  }

  process.exit(0);
}

run();
