const MathpixPdfService = require('../services/mathpixPdfService');
const { MCQDetector, LatexSanitizer, OCRPipeline } = require('../services/ocrPipeline');
const { VerificationQueueManager } = require('../services/verificationQueueManager');
const multer = require('multer');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// Canonicalize answer labels mapping
function canonicalizeAnswer(ans) {
  if (!ans) return '';
  const labelMap = {
    'a': 'A', 'b': 'B', 'c': 'C', 'd': 'D',
    'A': 'A', 'B': 'B', 'C': 'C', 'D': 'D',
    'ক': 'A', 'খ': 'B', 'গ': 'C', 'ঘ': 'D',
    '১': 'A', '২': 'B', '৩': 'C', '৪': 'D',
    '1': 'A', '2': 'B', '3': 'C', '4': 'D',
  };
  return labelMap[ans.trim()] || ans.trim().toUpperCase();
}

// Answer Key Parser
function parseAnswerKeys(text) {
  const answers = [];
  if (!text) return answers;
  const regex = /(\d{1,3})\s*[-–\s\.)\:]+\s*\(?([A-Da-dকখগঘ১২৩৪])\)?/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const qNum = parseInt(match[1], 10);
    const ans = canonicalizeAnswer(match[2]);
    answers.push({ questionNumber: qNum, correctAnswer: ans });
  }
  return answers;
}

// Count Expected Questions
function countExpectedQuestions(text) {
  if (!text) return 0;
  const lines = text.split('\n');
  const foundNumbers = new Set();
  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^(?:Q|Question\s*|(?:\d+[\.\)]))?(\d+)/i);
    if (match) {
      if (/^(?:Q\d+|Question\s*\d+|\d+[\.\)])/i.test(trimmed)) {
        foundNumbers.add(parseInt(match[1], 10));
      }
    }
  }
  return foundNumbers.size;
}

// Repeated Lines & Headers/Footers cleaning
function removeHeadersFootersAndRepeatedLines(pageTexts) {
  const pageLines = pageTexts.map(text => 
    text.split('\n').map(line => line.trim()).filter(Boolean)
  );

  const linePageCounts = new Map();
  pageLines.forEach((lines) => {
    const uniqueLinesInPage = new Set(lines);
    uniqueLinesInPage.forEach(line => {
      if (line.length < 4) return;
      linePageCounts.set(line, (linePageCounts.get(line) || 0) + 1);
    });
  });

  const repeatedLines = new Set();
  const threshold = Math.max(2, Math.ceil(pageTexts.length * 0.3));
  for (const [line, count] of linePageCounts.entries()) {
    if (count >= threshold) {
      repeatedLines.add(line);
    }
  }

  return pageTexts.map(text => {
    const lines = text.split('\n');
    const cleaned = lines.filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      
      if (/^Prepared by.*/i.test(trimmed)) return false;
      if (/^Downloaded from.*/i.test(trimmed)) return false;
      if (/^Page\s+\d+/i.test(trimmed)) return false;
      if (/^Page\s+No\.?\s*\d*/i.test(trimmed)) return false;
      if (/^www\..*/i.test(trimmed)) return false;
      if (/^https?:\/\/.*/i.test(trimmed)) return false;
      if (/^chhaya\s+mathematics/i.test(trimmed)) return false;
      
      if (repeatedLines.has(trimmed)) {
        return false;
      }
      return true;
    });
    return cleaned.join('\n');
  });
}

// QA Report Generator
function generateQAReport({
  expectedQuestions = 0,
  extractedQuestions = 0,
  totalRejected = 0,
  answerKeysFound = 0,
  footerPollutionDetected = false,
  chapterHeadingsRemoved = 0,
  duplicatesPrevented = 0,
  quarantinedQuestions = 0,
  failedPages = []
}) {
  const missingQuestions = Math.max(0, expectedQuestions - extractedQuestions);
  
  let completenessStatus = 'COMPLETE';
  let warningMessage = null;
  if (expectedQuestions > 0) {
    const completenessRatio = extractedQuestions / expectedQuestions;
    if (completenessRatio < 0.90) {
      completenessStatus = 'INCOMPLETE';
      warningMessage = `Missing questions detected. Expected: ${expectedQuestions}, Extracted: ${extractedQuestions}`;
    }
  }

  let score = 100;
  score -= quarantinedQuestions * 5;
  score -= missingQuestions * 10;
  if (completenessStatus === 'INCOMPLETE') {
    score -= 15;
  }
  score -= totalRejected * 3;
  if (footerPollutionDetected) {
    score -= 5;
  }
  score -= failedPages.length * 20; // Penalize 20 points per failed page

  score += Math.min(10, duplicatesPrevented * 2);
  score += Math.min(5, chapterHeadingsRemoved * 1);

  const overallQualityScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    expectedQuestions,
    extractedQuestions,
    missingQuestions,
    answerKeysFound,
    footerPollutionDetected,
    chapterHeadingsRemoved,
    duplicatesPrevented,
    quarantinedQuestions,
    overallQualityScore,
    completenessStatus,
    warningMessage,
    failedPages
  };
}

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

/**
 * Extract a single PDF page as a JPEG buffer using pdftoppm.
 * Resolution 200 DPI — good quality/speed balance.
 */
function extractPageAsBuffer(pdfPath, pageNum) {
  return new Promise((resolve, reject) => {
    const tmpBase = path.join(
      path.dirname(pdfPath),
      `ocr-page-${Date.now()}-${pageNum}`
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

/**
 * PDF Document Processing Controller
 */
class PdfController {
  constructor() {
    this.pdfService = new MathpixPdfService();
    const tempDir = path.join(__dirname, '../../public/temp');

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const diskStorage = multer.diskStorage({
      destination: (req, file, cb) => cb(null, tempDir),
      filename: (req, file, cb) => {
        const cleanExt = path.extname(file.originalname).toLowerCase();
        const safeBase = path.basename(file.originalname, cleanExt)
          .replace(/[^a-zA-Z0-9]/g, '_')
          .substring(0, 50);
        cb(null, `pdf-${Date.now()}-${safeBase}${cleanExt}`);
      }
    });

    this.upload = multer({
      storage: diskStorage,
      limits: { fileSize: 100 * 1024 * 1024, files: 1 }
    }).single('file');
  }

  /**
   * Submit PDF for processing (async queue — kept for compatibility)
   * POST /api/v1/pdf/scan
   */
  async submitPdf(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file provided' });
      }

      const pdfPath = req.file.path;
      const filename = req.file.originalname;
      const totalPages = await getPdfPageCount(pdfPath);

      const OCRJob = require('../models/ocrJobModel');
      const parentJob = new OCRJob({
        status: 'pending',
        sourceType: 'pdf',
        filename,
        mimetype: 'application/pdf',
        error: null,
      });
      await parentJob.save();

      return res.status(202).json({
        success: true,
        data: {
          pdfId: parentJob._id,
          status: 'submitted',
          statusUrl: `/api/v1/pdf/status/${parentJob._id}`,
          message: `PDF submitted. ${totalPages} pages queued.`
        }
      });
    } catch (error) {
      console.error('PDF submission error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Submit PDF by URL
   * POST /api/v1/pdf/scan-url
   */
  async submitPdfByUrl(req, res) {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ success: false, error: 'URL is required' });
      }

      const tempPath = path.join(__dirname, `../../public/temp/pdf-${Date.now()}.pdf`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download PDF: ${response.statusText}`);
      }

      const fileStream = fs.createWriteStream(tempPath);
      await new Promise((resolve, reject) => {
        response.body.pipe(fileStream);
        response.body.on('error', reject);
        fileStream.on('finish', resolve);
      });

      const totalPages = await getPdfPageCount(tempPath);
      const OCRJob = require('../models/ocrJobModel');
      const parentJob = new OCRJob({
        status: 'pending',
        sourceType: 'pdf',
        filename: url.split('/').pop() || 'document.pdf',
        mimetype: 'application/pdf',
        error: null,
      });
      await parentJob.save();

      return res.status(202).json({
        success: true,
        data: {
          pdfId: parentJob._id,
          status: 'submitted',
          statusUrl: `/api/v1/pdf/status/${parentJob._id}`
        }
      });
    } catch (error) {
      console.error('PDF URL submission error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Check PDF processing status
   * GET /api/v1/pdf/status/:pdfId
   */
  async getPdfStatus(req, res) {
    try {
      const { pdfId } = req.params;
      const OCRJob = require('../models/ocrJobModel');
      const parentJob = await OCRJob.findById(pdfId);
      if (!parentJob) {
        return res.status(404).json({ success: false, error: 'PDF job not found' });
      }

      return res.json({
        success: true,
        data: {
          status: parentJob.status === 'done' ? 'completed' : parentJob.status,
          percentDone: parentJob.status === 'done' ? 100 : 0,
          estimatedTimeRemaining: 0
        }
      });
    } catch (error) {
      console.error('PDF status error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Download PDF result
   * GET /api/v1/pdf/download/:pdfId/:format
   */
  async downloadPdfResult(req, res) {
    return res.status(501).json({
      success: false,
      error: 'Downloads handled inside individual Verification Sessions'
    });
  }

  /**
   * ═══════════════════════════════════════════════════════════════
   * MAIN EXTRACTION ENDPOINT — Synchronous In-Process PDF OCR
   * ═══════════════════════════════════════════════════════════════
   * POST /api/v1/pdf/extract-questions
   *
   * Strategy:
   *  1. Accept uploaded PDF file (or URL)
   *  2. Count pages with pdfinfo
   *  3. For each page: render to JPEG with pdftoppm (200 DPI)
   *  4. Run OCRPipeline.runFromBuffer() directly — same path as image scan
   *  5. Collect all parsed questions
   *  6. Create VerificationSession with status='completed'
   *  7. Return 200 with full session data immediately
   *
   * No Redis, no distributed worker, no polling needed.
   * Response arrives as soon as all pages are processed.
   */
  async extractQuestionsFromPdf(req, res) {
    let pdfPath = null;
    let ownedPdf = false;
    const requestStartedAt = Date.now();

    try {
      // ── 1. Resolve PDF path ───────────────────────────────────────────
      if (req.file) {
        pdfPath = req.file.path;
        ownedPdf = false;
      } else if (req.body && req.body.url) {
        pdfPath = path.join(__dirname, `../../public/temp/pdf-${Date.now()}.pdf`);
        ownedPdf = true;
        const response = await fetch(req.body.url);
        if (!response.ok) {
          throw new Error(`Failed to download PDF: ${response.statusText}`);
        }
        const fileStream = fs.createWriteStream(pdfPath);
        await new Promise((resolve, reject) => {
          response.body.pipe(fileStream);
          response.body.on('error', reject);
          fileStream.on('finish', resolve);
        });
      } else {
        return res.status(400).json({
          success: false,
          error: 'Must upload a PDF file or provide a URL'
        });
      }

      // ── 2. Page count ─────────────────────────────────────────────────
      let totalPages;
      try {
        totalPages = await getPdfPageCount(pdfPath);
      } catch (e) {
        throw new Error(`Cannot read PDF: ${e.message}. Make sure it is a valid PDF file.`);
      }

      const mongoose = require('mongoose');
      const { classNo = '12', chapter = 'General', engine = 'Mathpix' } = req.body;
      const isGeminiSelected = String(engine).toLowerCase() === 'gemini';
      const isGemmaSelected = String(engine).toLowerCase() === 'gemma' || String(engine).toLowerCase() === 'openrouter';

      let rawPageTexts = [];
      let expectedQuestionCount = 0;
      let allAnswerKeys = [];
      let failedPages = [];

      if (isGeminiSelected || isGemmaSelected) {
        console.log(`[PdfController] Direct API extraction requested: ${engine}`);
        let extracted = [];
        if (isGemmaSelected) {
          const { OpenRouterExtractionService } = require('../services/openRouterExtractionService');
          extracted = await OpenRouterExtractionService.extractFromPdfPath(pdfPath, parseInt(classNo), chapter);
        } else {
          const { GeminiExtractionService } = require('../services/geminiExtractionService');
          extracted = await GeminiExtractionService.extractFromPdfPath(pdfPath, parseInt(classNo), chapter);
        }

        finalQuestions = (extracted || []).map((gQ, idx) => {
          const _id = new mongoose.Types.ObjectId();
          return {
            _id,
            questionText: gQ.questionText,
            options: gQ.options,
            questionNumber: gQ.questionNumber || String(idx + 1),
            detectionOrder: idx + 1,
            format: gQ.format || 'mcq',
            columnA: gQ.columnA || [],
            columnB: gQ.columnB || [],
            matchingChoices: gQ.matchingChoices || [],
            blanks: gQ.blanks || [],
            blankCount: gQ.blankCount || 0,
            confidenceScores: {
              ocrConfidence: gQ.confidence ?? 0.90,
              parserConfidence: gQ.confidence ?? 0.90,
              overallConfidence: gQ.confidence ?? 0.90,
              rating: (gQ.confidence || 0.90) > 0.8 ? 'high' : ((gQ.confidence || 0.90) > 0.5 ? 'medium' : 'low')
            },
            validationErrors: gQ.validationErrors || [],
            quarantineReasons: gQ.quarantineReasons || [],
            extractionState: gQ.isValid ? 'ACCEPTED' : 'MANUAL_REVIEW',
            duplicateInfo: {
              detected: gQ.duplicateFound || false,
              similarity: gQ.duplicateFound ? 1.0 : 0.0,
              rating: gQ.duplicateFound ? 'Block duplicate' : 'Allow normally',
              existingQuestionId: gQ.duplicateQuestionId || null,
              existingQuestionText: ''
            },
            rawOcrData: {
              rawChunk: gQ.questionText,
              ocrConfidence: gQ.confidence ?? 0.90,
              pageType: 'MCQ_PAGE',
              effectiveParserType: 'mcq',
              layoutMetadata: { strategy: 'text-only' }
            }
          };
        });
      } else {
        console.log(`[PdfController] Running standard Mathpix pipeline...`);
        const { OCRProviderAdapter } = require('../services/ocrProviderAdapter');
        const { PageClassificationEngine } = require('../services/pageClassificationEngine');

        const ocrResults = [];

        // Loop over pages and run OCR Provider
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
          console.log(`[PdfController] Running OCR on page ${pageNum}/${totalPages}`);
          try {
            const pageBuffer = await extractPageAsBuffer(pdfPath, pageNum);
            const ocrResult = await OCRProviderAdapter.processImage(pageBuffer, 'image/jpeg', `page_${pageNum}.jpg`);
            console.log(`[PdfController] OCR completed for page ${pageNum}/${totalPages}`);
            ocrResults.push(ocrResult);
            rawPageTexts.push(ocrResult.latex || ocrResult.rawText || '');
          } catch (pageErr) {
            console.error(`[PdfController] Page ${pageNum} failed:`, pageErr.message);
            failedPages.push({
              page: pageNum,
              status: "FAILED",
              reason: pageErr.message
            });
          }
        }

        // ── 3. Clean page texts & remove repeated lines ──────────────────
        const cleanedPageTexts = removeHeadersFootersAndRepeatedLines(rawPageTexts);

        const nonAnsKeyPageTexts = [];
        const nonAnsKeyOcrResults = [];

        for (let i = 0; i < cleanedPageTexts.length; i++) {
          const text = cleanedPageTexts[i];
          const classification = PageClassificationEngine.classifyPage(text);

          if (classification.pageType === 'ANSWER_KEY_PAGE') {
            console.log(`[PdfController] Page ${i + 1} detected as ANSWER_KEY_PAGE. Extracting answer keys.`);
            const keys = parseAnswerKeys(text);
            allAnswerKeys.push(...keys);
          } else {
            nonAnsKeyPageTexts.push(text);
            nonAnsKeyOcrResults.push(ocrResults[i]);
          }
        }

        // ── 4. Count expected questions from non-answer-key pages ────────
        nonAnsKeyPageTexts.forEach(text => {
          expectedQuestionCount += countExpectedQuestions(text);
        });

        console.log(`[PdfController] Expected questions count: ${expectedQuestionCount}`);

        // ── 5. Combine non-answer-key page texts for segmentation ────────
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

          const parseResult = await OCRPipeline.runParsing(combinedOcrResult, req.file?.originalname || 'document.pdf');
          
          // Accumulate any answer keys found in sections
          if (parseResult.answerKeys) {
            allAnswerKeys.push(...parseResult.answerKeys);
          }

          const validationResult = await OCRPipeline.runValidation(
            parseResult.parsedQuestions,
            combinedOcrResult,
            parseResult.pageType,
            parseResult.sections,
            parseResult.totalRejected,
            null, // preprocessInfo
            req.file?.originalname || 'document.pdf',
            allAnswerKeys
          );

          finalQuestions = validationResult.parsedQuestions || [];
        }
      }

      // Add detectionOrder and traceable questionNumbers
      finalQuestions.forEach((q, idx) => {
        q.detectionOrder = idx + 1;
        if (!q.questionNumber || q.questionNumber === String(idx + 1)) {
          q.questionNumber = String(idx + 1);
        }
      });

      console.log(`[PdfController] Total questions extracted: ${finalQuestions.length}`);

      // ── 6. Create VerificationSession ─────────────────────────────────
      const sessionId = `pdf_sync_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const userId = req.user?.id || req.user?._id || null;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User credentials not found'
        });
      }

      const session = await VerificationQueueManager.createSession(
        sessionId,
        userId,
        finalQuestions,
        86400, // 24h TTL
        null,
        {
          pageType: 'PDF_DOCUMENT',
          sectionsFound: 0,
          totalExtracted: finalQuestions.length,
          totalRejected: 0,
          sourceUsed: 'pdf_sync',
          processingTimeMs: Date.now() - requestStartedAt,
          totalPages,
          expectedQuestions: expectedQuestionCount,
          answerKeysFound: allAnswerKeys.length,
          footerPollutionDetected: rawPageTexts.some(t => /(?:Prepared by|Downloaded from|Page\s+\d+|www\..*|https?:\/\/.*)/i.test(t)),
          chapterHeadingsRemoved: rawPageTexts.reduce((acc, text) => {
            const matches = text.match(/\b(?:chapter|exercise|ch\.)\s*\d/gi);
            return acc + (matches ? matches.length : 0);
          }, 0),
          failedPages
        },
        'completed',
        100
      );

      // ── 7. Cleanup PDF from disk ───────────────────────────────────────
      if (ownedPdf && pdfPath && fs.existsSync(pdfPath)) {
        try { fs.unlinkSync(pdfPath); } catch (_) {}
      }

      // ── 8. Return completed session immediately ────────────────────────
      return res.status(200).json({
        success: true,
        data: {
          pdfId: sessionId,
          sessionId: session.sessionId,
          queueSessionId: session.sessionId,
          currentIndex: 0,
          total: finalQuestions.length,
          items: session.items || [],
          questions: session.items || [],
          status: 'completed',
          progress: 100,
          totalPages,
          expiresAt: session.expiresAt
        }
      });

    } catch (error) {
      if (ownedPdf && pdfPath && fs.existsSync(pdfPath)) {
        try { fs.unlinkSync(pdfPath); } catch (_) {}
      }
      console.error('[PdfController] extractQuestionsFromPdf error:', error);
      return res.status(500).json({
        success: false,
        error: `PDF extraction failed: ${error.message}`
      });
    }
  }

  /**
   * Stream PDF pages (legacy stub)
   * GET /api/v1/pdf/stream/:pdfId
   */
  async streamPdfPages(req, res) {
    return res.status(501).json({ success: false, error: 'Streaming not supported in sync mode' });
  }

  /**
   * Delete PDF
   * DELETE /api/v1/pdf/:pdfId
   */
  async deletePdf(req, res) {
    try {
      const { pdfId } = req.params;
      await this.pdfService.deletePdf(pdfId);
      return res.json({ success: true, message: 'PDF deleted successfully' });
    } catch (error) {
      console.error('PDF deletion error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  getUploadMiddleware() {
    return this.upload;
  }
}

// Expose helper functions for unit testing
PdfController.removeHeadersFootersAndRepeatedLines = removeHeadersFootersAndRepeatedLines;
PdfController.countExpectedQuestions = countExpectedQuestions;
PdfController.generateQAReport = generateQAReport;
PdfController.parseAnswerKeys = parseAnswerKeys;
PdfController.canonicalizeAnswer = canonicalizeAnswer;

module.exports = PdfController;
