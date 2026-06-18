'use strict';

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const mongoose = require('mongoose');
const ImportJob = require('../models/importJobModel');
const ImportItem = require('../models/importItemModel');
const { OCRPipeline, QuestionSegmenter } = require('./ocrPipeline');
const { MCQOptionParser } = require('./mcqOptionParser');
const { QuestionDuplicateDetector } = require('./questionDuplicateDetector');

// Helper to count PDF pages using pdfinfo
function getPdfPageCount(pdfPath) {
  return new Promise((resolve, reject) => {
    exec(`pdfinfo "${pdfPath}"`, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`Failed to read PDF info: ${error.message}`));
      }
      const match = stdout.match(/Pages:\s+(\d+)/);
      if (match) {
        resolve(parseInt(match[1], 10));
      } else {
        reject(new Error('Could not find Page count in pdfinfo output'));
      }
    });
  });
}

// Helper to extract a page as JPEG buffer using pdftoppm
function extractPageAsBuffer(pdfPath, pageNum) {
  return new Promise((resolve, reject) => {
    const tmpBase = path.join(
      path.dirname(pdfPath),
      `import-ocr-page-${Date.now()}-${pageNum}`
    );
    const cmd = `pdftoppm -jpeg -f ${pageNum} -l ${pageNum} -r 200 -singlefile "${pdfPath}" "${tmpBase}"`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`pdftoppm page ${pageNum} failed: ${error.message}`));
      }
      const jpgPath = `${tmpBase}.jpg`;
      if (!fs.existsSync(jpgPath)) {
        return reject(new Error(`pdftoppm output not found: ${jpgPath}`));
      }
      try {
        const buffer = fs.readFileSync(jpgPath);
        fs.unlinkSync(jpgPath); // clean up immediately
        resolve(buffer);
      } catch (e) {
        reject(e);
      }
    });
  });
}

// Simple CSV line parser supporting double quotes
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result.map(val => val.replace(/^"|"$/g, '').replace(/""/g, '"'));
}

// Dynamic Class and Chapter Mapper helper
async function resolveClassAndChapter(classVal, chapterVal) {
  const { getClassIdFromNo } = require('../utils/classCache');
  const Chapter = mongoose.model('Chapter');
  const { normalizeChapterName } = require('../utils/chapterNormalization');

  const parsedClassNo = parseInt(classVal, 10) || 12;
  const classId = getClassIdFromNo(parsedClassNo) || getClassIdFromNo(12);

  let chapterName = (chapterVal || 'General').trim();
  let chapterId = null;

  if (classId && chapterName) {
    const normalized = normalizeChapterName(chapterName);
    let chap = await Chapter.findOne({ classId, normalizedChapterName: normalized });
    if (!chap) {
      chap = await Chapter.create({ classId, chapterName });
    }
    chapterId = chap._id;
  }
  return { classNo: parsedClassNo, classId, chapterName, chapterId };
}

// Normalize options array to exactly 4 items
function normalizeOptions(options) {
  const list = (options || []).map(o => {
    if (typeof o === 'object' && o !== null) {
      return (o.text || '').trim();
    }
    return String(o || '').trim();
  }).filter(Boolean);

  while (list.length < 4) {
    list.push(`Option ${String.fromCharCode(65 + list.length)}`);
  }
  return list.slice(0, 4);
}

class ImportParserService {
  /**
   * Process and parse an ImportJob asynchronously.
   * Runs the appropriate parser based on job type.
   */
  static async processJob(jobId) {
    const job = await ImportJob.findById(jobId);
    if (!job) return;

    try {
      job.status = 'parsing';
      await job.save();

      let parsedItems = [];

      switch (job.importType) {
        case 'pdf':
          parsedItems = await this.parsePDFJob(job);
          break;
        case 'image':
          parsedItems = await this.parseImageJob(job);
          break;
        case 'url':
          parsedItems = await this.parseURLJob(job);
          break;
        case 'markdown':
          parsedItems = await this.parseMarkdownJob(job);
          break;
        case 'csv':
          parsedItems = await this.parseCSVJob(job);
          break;
        default:
          throw new Error(`Unsupported import type: ${job.importType}`);
      }

      console.log(`[ImportService] Parsed ${parsedItems.length} items for job ${job._id}`);

      // Save extracted items into MongoDB under ImportItem
      let savedCount = 0;
      for (const item of parsedItems) {
        // Run Duplicate Check before saving ImportItem
        const dupCheck = await QuestionDuplicateDetector.checkDuplicate(
          item.questionText,
          item.classNo,
          item.options,
          item.correctAnswer
        );

        const importItem = new ImportItem({
          jobId: job._id,
          status: 'pending_verification',
          questionText: item.questionText,
          options: normalizeOptions(item.options),
          correctAnswer: item.correctAnswer || 'A',
          explanation: item.explanation || '',
          classNo: item.classNo,
          chapterName: item.chapterName,
          language: item.language || 'English',
          duplicateInfo: {
            detected: dupCheck.duplicateDetected,
            similarity: dupCheck.similarity,
            rating: dupCheck.rating,
            existingQuestionId: dupCheck.existingQuestion ? dupCheck.existingQuestion._id : null
          },
          rawItemData: item.rawItemData || {}
        });

        await importItem.save();
        savedCount++;
      }

      job.status = 'preview_ready';
      job.totalItems = savedCount;
      await job.save();

    } catch (err) {
      console.error(`[ImportService] Job ${job._id} failed:`, err.message);
      job.status = 'failed';
      job.errorMessage = err.message;
      await job.save();
    }
  }

  // --- PDF PARSER ---
  static async parsePDFJob(job) {
    const pdfPath = job.rawSourceData;
    if (!pdfPath || !fs.existsSync(pdfPath)) {
      throw new Error('PDF file path not found or invalid.');
    }

    const pageCount = await getPdfPageCount(pdfPath);
    const items = [];

    const { PageClassificationEngine } = require('./pageClassificationEngine');
    const { pdfController } = require('../controllers/pdfController'); // stub to clean headers

    const rawPageTexts = [];
    const ocrResults = [];

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const pageBuffer = await extractPageAsBuffer(pdfPath, pageNum);
      const ocrResult = await OCRPipeline.runFromBuffer(pageBuffer, 'image/jpeg', `page_${pageNum}.jpg`);
      ocrResults.push(ocrResult);
      rawPageTexts.push(ocrResult.latex || ocrResult.rawText || '');
    }

    // Reuse headers and footer cleaning
    const PdfController = require('../controllers/pdfController');
    const cleanedPageTexts = PdfController.removeHeadersFootersAndRepeatedLines(rawPageTexts);
    const allAnswerKeys = [];

    const nonAnsKeyOcrResults = [];
    for (let i = 0; i < cleanedPageTexts.length; i++) {
      const text = cleanedPageTexts[i];
      const classification = PageClassificationEngine.classifyPage(text);
      if (classification.pageType === 'ANSWER_KEY_PAGE') {
        const keys = PdfController.parseAnswerKeys(text);
        allAnswerKeys.push(...keys);
      } else {
        nonAnsKeyOcrResults.push(ocrResults[i]);
      }
    }

    if (nonAnsKeyOcrResults.length > 0) {
      const combinedRawText = nonAnsKeyOcrResults.map(r => r.rawText || '').join('\n\n');
      const combinedLatex = nonAnsKeyOcrResults.map(r => r.latex || r.rawText || '').join('\n\n');
      const avgConfidence = nonAnsKeyOcrResults.reduce((sum, r) => sum + (r.confidence || 1.0), 0) / nonAnsKeyOcrResults.length;

      const combinedOcrResult = {
        rawText: combinedRawText,
        latex: combinedLatex,
        confidence: avgConfidence,
        lines: nonAnsKeyOcrResults.flatMap(r => r.lines || [])
      };

      const parseResult = await OCRPipeline.runParsing(combinedOcrResult, job.sourceFileName || 'document.pdf');
      if (parseResult.answerKeys) {
        allAnswerKeys.push(...parseResult.answerKeys);
      }

      const validationResult = await OCRPipeline.runValidation(
        parseResult.parsedQuestions,
        combinedOcrResult,
        parseResult.pageType,
        parseResult.sections,
        parseResult.totalRejected,
        null,
        job.sourceFileName || 'document.pdf',
        allAnswerKeys
      );

      const parsedQuestions = validationResult.parsedQuestions || [];
      for (const q of parsedQuestions) {
        items.push({
          questionText: q.question,
          options: q.options ? q.options.map(o => typeof o === 'object' ? o.text : o) : [],
          correctAnswer: q.correctAnswer || 'A',
          classNo: 12, // default
          chapterName: 'General',
          language: 'English',
          explanation: '',
          rawItemData: { ocrChunk: q.rawChunk }
        });
      }
    }

    // Clean up temporary PDF file
    try { fs.unlinkSync(pdfPath); } catch (_) {}
    return items;
  }

  // --- IMAGE PARSER ---
  static async parseImageJob(job) {
    const imagePath = job.rawSourceData;
    if (!imagePath || !fs.existsSync(imagePath)) {
      throw new Error('Image file path not found or invalid.');
    }

    const buffer = fs.readFileSync(imagePath);
    const ocrResult = await OCRPipeline.runFromBuffer(buffer, job.metadata?.mimetype || 'image/jpeg', job.sourceFileName || 'image.jpg');
    const items = [];

    const parsedQuestions = ocrResult.parsedQuestions || [];
    for (const q of parsedQuestions) {
      items.push({
        questionText: q.question,
        options: q.options ? q.options.map(o => typeof o === 'object' ? o.text : o) : [],
        correctAnswer: q.correctAnswer || 'A',
        classNo: 12,
        chapterName: 'General',
        language: 'English',
        explanation: '',
        rawItemData: { ocrChunk: q.rawChunk }
      });
    }

    // Clean up temporary image file
    try { fs.unlinkSync(imagePath); } catch (_) {}
    return items;
  }

  // --- URL PARSER ---
  static async parseURLJob(job) {
    const url = job.rawSourceData;
    if (!url || !url.startsWith('http')) {
      throw new Error('Invalid or missing website URL.');
    }

    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch website contents. Status: ${response.statusText}`);
    }

    const html = await response.text();
    // Strip script, style, and HTML tags to extract raw visible text
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&nbsp;/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n');

    // Run segmenter on extracted text
    const segments = QuestionSegmenter.segment(text);
    const items = [];

    for (const seg of segments) {
      const parsed = MCQOptionParser.parse(seg.text);
      if (parsed) {
        items.push({
          questionText: parsed.question,
          options: parsed.options ? parsed.options.map(o => o.text) : [],
          correctAnswer: 'A', // placeholder to edit
          classNo: 12,
          chapterName: 'General',
          language: 'English',
          explanation: '',
          rawItemData: { segmentText: seg.text }
        });
      }
    }
    return items;
  }

  // --- MARKDOWN PARSER ---
  static async parseMarkdownJob(job) {
    const mdText = job.rawSourceData;
    if (!mdText) throw new Error('Markdown text content is empty.');

    // Split markdown by lines starting with #
    const lines = mdText.split('\n');
    const blocks = [];
    let currentBlock = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^#+\s+/.test(trimmed)) {
        if (currentBlock.length > 0) {
          blocks.push(currentBlock.join('\n'));
        }
        currentBlock = [line];
      } else {
        currentBlock.push(line);
      }
    }
    if (currentBlock.length > 0) {
      blocks.push(currentBlock.join('\n'));
    }

    const items = [];

    for (const block of blocks) {
      const text = block.trim();
      if (!text) continue;

      const blockLines = text.split('\n');
      const questionAndOptionsLines = [];
      
      let classNo = 12;
      let chapterName = 'General';
      let language = 'English';
      let correctAnswer = 'A';
      let explanation = '';

      for (const line of blockLines) {
        const trimmed = line.trim();
        
        const classMatch = trimmed.match(/^(?:class|classNo)\s*:\s*(\d+)/i);
        const chapMatch = trimmed.match(/^(?:chapter|chapterName)\s*:\s*(.+)/i);
        const langMatch = trimmed.match(/^(?:language|lang)\s*:\s*(.+)/i);
        const ansMatch = trimmed.match(/^(?:correctAnswer|answer|correct)\s*:\s*(.+)/i);
        const expMatch = trimmed.match(/^(?:explanation|exp)\s*:\s*(.+)/i);

        if (classMatch) {
          classNo = parseInt(classMatch[1], 10);
        } else if (chapMatch) {
          chapterName = chapMatch[1].trim();
        } else if (langMatch) {
          const l = langMatch[1].trim().toLowerCase();
          if (l === 'bengali') language = 'Bengali';
          else if (l === 'both') language = 'Both';
          else language = 'English';
        } else if (ansMatch) {
          correctAnswer = ansMatch[1].trim().toUpperCase();
        } else if (expMatch) {
          explanation = expMatch[1].trim();
        } else {
          // If it's a heading line (starts with ### or similar), we can strip the heading prefix
          // to make question text cleaner.
          if (/^#+\s+/.test(trimmed)) {
            const strippedHeading = trimmed.replace(/^#+\s+/, '');
            // Skip generic "Question X" header lines to avoid putting them in the question text
            if (/^(?:Question|Q)\s*\d+/i.test(strippedHeading)) {
              continue;
            }
            questionAndOptionsLines.push(strippedHeading);
          } else {
            questionAndOptionsLines.push(line);
          }
        }
      }

      const cleanBlockText = questionAndOptionsLines.join('\n').trim();
      if (!cleanBlockText) continue;

      const parsed = MCQOptionParser.parse(cleanBlockText);
      if (!parsed) continue;

      if (!['A', 'B', 'C', 'D'].includes(correctAnswer)) {
        const index = parsed.options.findIndex(o => o.text.toUpperCase() === correctAnswer);
        if (index !== -1) {
          correctAnswer = String.fromCharCode(65 + index);
        } else {
          correctAnswer = 'A';
        }
      }

      items.push({
        questionText: parsed.question,
        options: parsed.options.map(o => o.text),
        correctAnswer,
        classNo,
        chapterName,
        language,
        explanation,
        rawItemData: { rawSegment: text }
      });
    }

    return items;
  }

  // --- CSV PARSER ---
  static async parseCSVJob(job) {
    const csvText = job.rawSourceData;
    if (!csvText) throw new Error('CSV text content is empty.');

    const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean);
    const items = [];

    let isFirstLine = true;
    for (const line of lines) {
      // Basic header detection/skip
      if (isFirstLine) {
        isFirstLine = false;
        if (line.toLowerCase().includes('questiontext') || line.toLowerCase().includes('option')) {
          continue;
        }
      }

      const cols = parseCSVLine(line);
      if (cols.length < 6) continue; // minimum: question, 4 options, answer

      const questionText = cols[0];
      const options = [cols[1], cols[2], cols[3], cols[4]];
      let correctAnswer = cols[5] || 'A';
      
      // Map correctAnswer letters A/B/C/D to option text or leave as-is
      correctAnswer = correctAnswer.trim().toUpperCase();

      const classNo = parseInt(cols[6], 10) || 12;
      const chapterName = cols[7] || 'General';
      const languageVal = cols[8] || 'English';
      let language = 'English';
      if (languageVal.toLowerCase() === 'bengali') language = 'Bengali';
      else if (languageVal.toLowerCase() === 'both') language = 'Both';

      const explanation = cols[9] || '';

      items.push({
        questionText,
        options,
        correctAnswer,
        classNo,
        chapterName,
        language,
        explanation,
        rawItemData: { rawCsvLine: line }
      });
    }

    return items;
  }
}

module.exports = { ImportParserService, resolveClassAndChapter };
