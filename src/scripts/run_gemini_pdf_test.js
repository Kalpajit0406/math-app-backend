'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const connectDB = require('../config/db');

// Load Mongoose models
const Class = require('../models/classModel');
const Chapter = require('../models/chapterModel');

const { GeminiExtractionService } = require('../services/geminiExtractionService');

const args = process.argv.slice(2);
const pdfPath = args[0];

async function run() {
  console.log('--- RUNNING NATIVE GEMINI PDF EXTRACTION TEST ---');
  if (!pdfPath) {
    console.error('Usage: node src/scripts/run_gemini_pdf_test.js <path-to-pdf>');
    process.exit(1);
  }

  const resolvedPath = path.resolve(pdfPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await connectDB();
  console.log('Database connected.');

  console.log(`\n==========================================`);
  console.log(`Processing PDF: ${path.basename(resolvedPath)}`);
  console.log(`==========================================`);

  try {
    const startTime = Date.now();
    const results = await GeminiExtractionService.extractFromPdfPath(resolvedPath, 12, 'General');
    console.log(`\nFinished in ${Date.now() - startTime}ms. Found ${results.length} questions.`);

    results.forEach((q, i) => {
      console.log(`\n--- Question ${i + 1} (Q# ${q.questionNumber || 'N/A'}, Page: ${q.pageNumber || 'N/A'}) ---`);
      console.log(`Valid: ${q.isValid}`);
      console.log(`Text: ${q.questionText}`);
      console.log(`Options:`, q.options);
      console.log(`Correct: Option ${q.correctOption} (${q.correctAnswer})`);
      console.log(`Language: ${q.language}`);
    });

  } catch (err) {
    console.error(`\nFailed to process PDF:`, err);
  }

  process.exit(0);
}

run();
