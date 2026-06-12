/**
 * OCRPipeline — Document-Understanding Architecture
 *
 * PIPELINE:
 *   Buffer/URL
 *   → Upload Validation
 *   → Image Preprocessing
 *   → OCR Provider
 *   → OCR Recovery (low confidence)
 *   → Text Normalization
 *   → LaTeX Sanitization
 *   → [NEW] Page Classification  ← DOCUMENT UNDERSTANDING LAYER
 *   → Answer-Key Page Blocking
 *   → Section Extraction
 *   → Question Segmentation
 *   → [NEW] Parser Routing (MCQ | FILL | TABLE)
 *   → Format-Specific Parsing
 *   → Structural Validation
 *   → Confidence Scoring
 *   → Diagnostics Enrichment
 *   → Queue Insertion
 */

'use strict';

const { UploadHandler }            = require('./uploadHandler');
const { ImagePreprocessor }        = require('./imagePreprocessor');
const { OCRProviderAdapter }       = require('./ocrProviderAdapter');
const { OCRNormalizer }            = require('./ocrNormalizer');
const { QuestionSegmenter }        = require('./questionSegmenter');
const { MCQOptionParser }          = require('./mcqOptionParser');
const { LatexSanitizer }           = require('./latexSanitizer');
const { VerificationQueueManager } = require('./verificationQueueManager');
const { QuestionValidator }        = require('./questionValidator');
const { PreviewRenderer }          = require('./previewRenderer');
const { OCRRecoveryEngine }        = require('./ocrRecoveryEngine');
const { ContentClassificationEngine } = require('./contentClassificationEngine');
const { PageClassificationEngine, PARSER_TYPES } = require('./pageClassificationEngine');
const { FillInBlankParser }        = require('./fillInBlankParser');
const { ColumnMatchingParser }     = require('./columnMatchingParser');
const { LayoutAnalysisEngine }     = require('./layoutAnalysisEngine');

// ─── 1. MCQ DETECTOR ─────────────────────────────────────────────────────────
class MCQDetector {
  static splitMultipleQuestions(text) {
    if (!text) return [];
    const segments = QuestionSegmenter.segment(text);
    return segments.map((seg, idx) => ({
      text: seg.text,
      number: seg.number || (idx + 1).toString(),
      numberPattern: seg.rawHeader || ''
    }));
  }

  static detect(text) {
    if (!text || typeof text !== 'string') return null;
    return MCQOptionParser.parse(text.trim());
  }

  static detectMultiple(text, rawText = null) {
    const chunks = this.splitMultipleQuestions(text);
    const results = [];
    console.log(`[MCQDetector.detectMultiple] Processing ${chunks.length} segments.`);
    for (const chunk of chunks) {
      if (!chunk.text || !chunk.text.trim()) continue;
      const parsed = this.detect(chunk.text);
      if (parsed) {
        results.push({
          question: LatexSanitizer.sanitize(parsed.question),
          options: parsed.options.map(o => ({ label: o.label, text: LatexSanitizer.sanitize(o.text) })),
          format: parsed.format,
          questionNumber: chunk.number,
          rawChunk: chunk.text,
          ocrConfidence: null
        });
      } else {
        results.push({
          question: LatexSanitizer.sanitize(chunk.text),
          options: [
            { label: 'A', text: '' },
            { label: 'B', text: '' },
            { label: 'C', text: '' },
            { label: 'D', text: '' }
          ],
          format: 'descriptive',
          questionNumber: chunk.number,
          rawChunk: chunk.text,
          ocrConfidence: null
        });
      }
    }
    return results;
  }
}

// ─── 2. IN-MEMORY QUEUE MANAGER ──────────────────────────────────────────────
class QuestionQueueManager {
  constructor() {
    this.queues = new Map();
    this.maxQueueSize = 100;
  }

  storeQuestions(sessionId, questions, ttlSeconds = 3600) {
    const expiresAt = Date.now() + (ttlSeconds * 1000);
    const cappedQuestions = Array.isArray(questions) ? questions.slice(0, this.maxQueueSize) : [];
    if (Array.isArray(questions) && questions.length > this.maxQueueSize) {
      console.warn(`[QuestionQueueManager] Queue capped at ${this.maxQueueSize} items for session ${sessionId}.`);
    }
    this.queues.set(sessionId, {
      items: cappedQuestions,
      createdAt: Date.now(),
      expiresAt,
      currentIndex: 0
    });
    return { sessionId, count: cappedQuestions.length, expiresAt };
  }

  getCurrentQuestion(sessionId) {
    const queue = this.queues.get(sessionId);
    if (!queue || this._isExpired(queue)) { this.queues.delete(sessionId); return null; }
    return queue.items[queue.currentIndex] || null;
  }

  getQueueItems(sessionId) {
    const queue = this.queues.get(sessionId);
    if (!queue || this._isExpired(queue)) { this.queues.delete(sessionId); return []; }
    return queue.items;
  }

  nextQuestion(sessionId) {
    const queue = this.queues.get(sessionId);
    if (!queue) return null;
    queue.currentIndex++;
    if (queue.currentIndex >= queue.items.length) { this.queues.delete(sessionId); return null; }
    return queue.items[queue.currentIndex];
  }

  prevQuestion(sessionId) {
    const queue = this.queues.get(sessionId);
    if (!queue) return null;
    if (queue.currentIndex > 0) queue.currentIndex--;
    return queue.items[queue.currentIndex];
  }

  getStatus(sessionId) {
    const queue = this.queues.get(sessionId);
    if (!queue) return null;
    return {
      total: queue.items.length,
      currentIndex: queue.currentIndex,
      currentNumber: queue.currentIndex + 1,
      hasNext: queue.currentIndex < queue.items.length - 1,
      hasPrev: queue.currentIndex > 0,
      expiresIn: Math.max(0, Math.round((queue.expiresAt - Date.now()) / 1000))
    };
  }

  removeQuestion(sessionId, index) {
    const queue = this.queues.get(sessionId);
    if (!queue) return false;
    queue.items.splice(index, 1);
    if (queue.currentIndex >= queue.items.length && queue.currentIndex > 0) queue.currentIndex--;
    return true;
  }

  clearQueue(sessionId) { this.queues.delete(sessionId); }

  _isExpired(queue) { return Date.now() > queue.expiresAt; }

  cleanup() {
    const now = Date.now();
    for (const [sessionId, queue] of this.queues.entries()) {
      if (now > queue.expiresAt) this.queues.delete(sessionId);
    }
  }
}

// ─── 3. OCR RESULT VALIDATOR ─────────────────────────────────────────────────
class OCRResultValidator {
  static validate(rawText, latex, confidence) {
    const conf = confidence != null ? confidence : 1.0;
    let rating = 'high';
    if (conf < 0.6) rating = 'low';
    else if (conf < 0.85) rating = 'medium';
    const isValid = (rawText && rawText.trim().length > 0) || (latex && latex.trim().length > 0);
    return { confidence: conf, rating, isValid: !!isValid };
  }
}

// ─── 4. PARSER ROUTER ────────────────────────────────────────────────────────
/**
 * Route a single segment to the correct parser based on its classified type.
 * Returns a normalised parsed block: { question, options, columnA, columnB,
 *   blanks, blankCount, format, parserType, parserConfidence }
 */
function routeToParser(segmentText, parserType, ocrConfidence) {
  const tag = `[ParserRouter:${parserType}]`;

  switch (parserType) {

    case PARSER_TYPES.TABLE: {
      console.log(`${tag} Routing to ColumnMatchingParser.`);
      const result = ColumnMatchingParser.parse(segmentText);
      return {
        question:        result.question,
        options:         result.options || [],
        columnA:         result.columnA || [],
        columnB:         result.columnB || [],
        matchingChoices: result.matchingChoices || [],
        blanks:          [],
        blankCount:      0,
        format:          'column_matching',
        parserType:      PARSER_TYPES.TABLE,
        parserConfidence: result.parserConfidence,
      };
    }

    case PARSER_TYPES.FILL: {
      console.log(`${tag} Routing to FillInBlankParser.`);
      const result = FillInBlankParser.parse(segmentText);
      return {
        question:        result.question,
        options:         [],   // NEVER fabricate MCQ options for fill
        columnA:         [],
        columnB:         [],
        matchingChoices: [],
        blanks:          result.blanks || [],
        blankCount:      result.blankCount || 0,
        format:          'fill_in_blank',
        parserType:      PARSER_TYPES.FILL,
        parserConfidence: result.parserConfidence,
      };
    }

    case PARSER_TYPES.MCQ:
    default: {
      console.log(`${tag} Routing to MCQOptionParser.`);
      const parsed = MCQOptionParser.parse(segmentText.trim());
      if (parsed && parsed.options && parsed.options.filter(o => o.text && o.text.trim()).length >= 2) {
        // Recover real question text if parser returned a placeholder
        let questionText = parsed.question;
        const PLACEHOLDER_Q = /^(?:Question\s*(?:Text)?|Q\.?No\.?)$/i;
        if (PLACEHOLDER_Q.test(questionText.trim())) {
          // Extract from the first non-empty line of the segment (before any option lines)
          const firstMeaningfulLine = segmentText.trim().split('\n').find(l => {
            const t = l.trim();
            return t.length > 3 && !/^\s*[\(\[]?\s*[A-Da-dকখগঘ১২৩৪]\s*[\)\]\.\:]/.test(t);
          });
          if (firstMeaningfulLine) {
            questionText = firstMeaningfulLine.replace(/^\d{1,3}[\.)\-:]\s*/, '').trim();
          }
        }
        return {
          question:        questionText,
          options:         parsed.options,
          columnA:         [],
          columnB:         [],
          matchingChoices: [],
          blanks:          [],
          blankCount:      0,
          format:          parsed.format || 'mcq',
          parserType:      PARSER_TYPES.MCQ,
          parserConfidence: 0.85,
        };
      }
      // MCQ parser found nothing useful — return as descriptive
      return {
        question:        segmentText.trim(),
        options:         [
          { label: 'A', text: '' },
          { label: 'B', text: '' },
          { label: 'C', text: '' },
          { label: 'D', text: '' },
        ],
        columnA:         [],
        columnB:         [],
        matchingChoices: [],
        blanks:          [],
        blankCount:      0,
        format:          'descriptive',
        parserType:      PARSER_TYPES.MCQ,
        parserConfidence: 0.40,
      };
    }
  }
}

// ─── 5. STRUCTURAL PRE-FILTER ────────────────────────────────────────────────
/**
 * Candidate filtering logic to reject non-question lines.
 */
function isQuestionCandidate(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  
  const rejectPatterns = [
    /^(?:CHAPTER|UNIT|EXERCISE|MULTIPLE CHOICE QUESTIONS|SHORT ANSWER QUESTIONS|LONG ANSWER QUESTIONS|ANSWERS|SOLUTIONS|ANSWER KEY|INDEX|CONTENTS)\b/i,
    /^(?:CHAPTER|UNIT|EXERCISE|MULTIPLE CHOICE QUESTIONS|SHORT ANSWER QUESTIONS|LONG ANSWER QUESTIONS|ANSWERS|SOLUTIONS|ANSWER KEY|INDEX|CONTENTS)\s*[-–\:\d]/i,
    /^(?:Conventional\s*Type|Multiple\s*Choice\s*Questions|Fill\s*in\s*the\s*Blank|Column\s*Matching|Analytical\s*Type|Short\s*Answer\s*Type|Long\s*Answer\s*Type|উত্তরমালা|উত্তর|Answers?(?:\s*Key)?)\s*$/i
  ];

  for (const pattern of rejectPatterns) {
    if (pattern.test(trimmed)) return false;
  }

  return true;
}

/**
 * Answer Key Parsing Helper
 */
function parseAnswerKeys(text) {
  const answers = [];
  if (!text) return answers;
  
  const canonicalizeAnswer = (ans) => {
    if (!ans) return '';
    const labelMap = {
      'a': 'A', 'b': 'B', 'c': 'C', 'd': 'D',
      'A': 'A', 'B': 'B', 'C': 'C', 'D': 'D',
      'ক': 'A', 'খ': 'B', 'গ': 'C', 'ঘ': 'D',
      '১': 'A', '২': 'B', '৩': 'C', '৪': 'D',
      '1': 'A', '2': 'B', '3': 'C', '4': 'D',
    };
    return labelMap[ans.trim()] || ans.trim().toUpperCase();
  };

  const regex = /(\d{1,3})\s*[-–\s\.)\:]+\s*\(?([A-Da-dকখগঘ১২৩৪])\)?/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const qNum = parseInt(match[1], 10);
    const ans = canonicalizeAnswer(match[2]);
    answers.push({ questionNumber: qNum, correctAnswer: ans });
  }
  return answers;
}

/**
 * Quick pre-filter check BEFORE creating the full enriched object.
 * Returns { skip: true, reason } if this segment should be discarded.
 */
function preFilterSegment(questionText, questionNum, seenNumbers) {
  const text = questionText.trim();

  if (text.length < 5) {
    return { skip: true, reason: `Fragment too short (${text.length} chars)` };
  }

  if (!isQuestionCandidate(text)) {
    return { skip: true, reason: `Candidate filter rejected: "${text}"` };
  }

  // Answer key string leaked through
  if (
    ContentClassificationEngine.isAnswerKeyPage(text) ||
    /^\s*\(?[a-dA-Dকখগঘ১২৩৪i-ivI-IV]\)?\s*$/.test(text)
  ) {
    return { skip: true, reason: `Answer key fragment: "${text}"` };
  }

  // Duplicate question number within the same section
  if (seenNumbers.has(questionNum)) {
    return { skip: true, reason: `Duplicate question number ${questionNum}` };
  }

  return { skip: false };
}

/**
 * Detect if there are overlapping bounding boxes in the OCR output.
 */
function detectOverlappingBoxes(lines) {
  if (!Array.isArray(lines) || lines.length < 2) return false;
  const boxes = [];
  for (const line of lines) {
    let box = line.bbox || line.rect || line.rect_pix;
    if (!box) continue;
    let x = 0, y = 0, w = 0, h = 0;
    if (Array.isArray(box)) {
      x = box[0]; y = box[1]; w = box[2]; h = box[3];
    } else if (typeof box === 'object') {
      x = box.left ?? box.x ?? 0;
      y = box.top ?? box.y ?? 0;
      w = box.width ?? box.w ?? 0;
      h = box.height ?? box.h ?? 0;
    }
    if (w <= 0 || h <= 0) continue;
    boxes.push({ x1: x, y1: y, x2: x + w, y2: y + h, area: w * h });
  }

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const b1 = boxes[i];
      const b2 = boxes[j];
      const ix1 = Math.max(b1.x1, b2.x1);
      const iy1 = Math.max(b1.y1, b2.y1);
      const ix2 = Math.min(b1.x2, b2.x2);
      const iy2 = Math.min(b1.y2, b2.y2);

      if (ix1 < ix2 && iy1 < iy2) {
        const intersection = (ix2 - ix1) * (iy2 - iy1);
        const minArea = Math.min(b1.area, b2.area);
        if (intersection > minArea * 0.40) {
          return true;
        }
      }
    }
  }
  return false;
}

// Helper to calculate garbage ratio
function calculateGarbageRatio(text) {
  if (!text) return 0;
  const clean = text.trim();
  if (clean.length === 0) return 0;
  // Non-alphanumeric, non-whitespace, non-standard math symbols/punctuation count as garbage
  const junkChars = clean.match(/[^a-zA-Z0-9\s+\-=*/^$\\_{}\[\]()|<>.,;?!:θπαβγδεθλμπσφω∫∑∏√±≤≥≠≈∞]/g) || [];
  return junkChars.length / clean.length;
}

// Helper to truncate footer leaks in options
function truncateFooterLeak(text) {
  if (!text) return '';
  const footerPatterns = [
    /\s+Prepared by.*/i,
    /\s+Downloaded from.*/i,
    /\s+Page\s+\d+.*/i,
    /\s+www\..*/i,
    /\s+https?:\/\/.*/i,
    /\s+Copyright.*/i,
    /\s+All rights reserved.*/i
  ];
  let cleaned = text;
  for (const pattern of footerPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  return cleaned.trim();
}

/**
 * Compute a composite confidence score from OCR and parser signals.
 */
function computeConfidenceScore(ocrConfidence, parserConfidence, layoutConfidence, sectionConfidence, segmentText, parsedBlock, questionNumber, extraSignals = {}) {
  const ocr = ocrConfidence != null ? ocrConfidence : 0.80;
  const parser = parserConfidence != null ? parserConfidence : 0.70;
  const layout = layoutConfidence != null ? layoutConfidence : 0.80;
  const sect = sectionConfidence != null ? sectionConfidence : 0.80;

  const questionText = (segmentText || parsedBlock?.question || '').trim();

  // 1. Boundary Confidence (10% weight)
  let boundaryConfidence = questionNumber != null ? 1.0 : 0.75;
  const bleedRegex = /(?:\n\s*\d+[\s.)]|\s+\([b-z]\)\s+|\bQ\d+\b)/;
  if (bleedRegex.test(questionText)) {
    boundaryConfidence = Math.max(0, boundaryConfidence - 0.25);
  }

  // 2. Option Integrity (10% weight)
  const format = (parsedBlock?.format || '').toLowerCase();
  const options = parsedBlock?.options || [];
  const filledOptions = options.filter(o => o.text && o.text.trim().length > 0).length;
  const isMCQ = ['mcq', 'line-based', 'inline-mcq', 'structured'].includes(format);
  
  let optionIntegrity = 1.0;
  if (isMCQ) {
    if (filledOptions >= 4) optionIntegrity = 1.0;
    else if (filledOptions === 3) optionIntegrity = 0.75;
    else if (filledOptions === 2) optionIntegrity = 0.50;
    else optionIntegrity = 0.0;
  }

  // 3. Structural Confidence (15% weight)
  const missingQuestion = questionText.length < 5 || /^(?:Question\s*(?:Text)?|Q\.?No\.?)$/i.test(questionText);
  const missingAnswers = isMCQ && filledOptions < 2;
  let structuralConfidence = 1.0;
  if (missingQuestion) structuralConfidence -= 0.50;
  if (missingAnswers) structuralConfidence -= 0.30;
  structuralConfidence = Math.max(0, structuralConfidence);

  // 4. Semantic Confidence (15% weight)
  let semanticConfidence = 0.80; // default plain text
  const mathKeywords = /\b(?:find|evaluate|solve|equals?|determine|calculate|prove|show|simplify|integrate|differentiate|matrix|equation|probability|triangle|circle|derivative|angle|sum|product|ratio|fraction|expression|value|what|how|where|verify|construct)\b/i;
  const mathSymbols = /[+\-=*/^\\{}\[\]|<>∫∑∏√±≤≥≠≈∞αβγδεθλμπσφω]/;
  const trigPatterns = /\\(?:sin|cos|tan|cot|sec|csc|log|ln|exp|lim|max|min)/;
  const cleanText = questionText.replace(/\s+/g, '');
  
  if (cleanText.length > 0) {
    const garbageRatio = calculateGarbageRatio(questionText);
    if (garbageRatio > 0.50) {
      semanticConfidence = 0.40;
    } else if (trigPatterns.test(questionText) || mathSymbols.test(questionText) || mathKeywords.test(questionText)) {
      semanticConfidence = 1.0;
    }
  } else {
    semanticConfidence = 0.40;
  }

  // LaTeX confidence: check unclosed braces (used internally, not part of composite weights directly)
  let unclosed = 0;
  const openers = ['{', '[', '('];
  const closers = ['}', ']', ')'];
  const stack = [];
  for (const char of questionText) {
    if (openers.includes(char)) {
      stack.push(char);
    } else if (closers.includes(char)) {
      const idx = closers.indexOf(char);
      if (stack.length > 0 && stack[stack.length - 1] === openers[idx]) {
        stack.pop();
      } else {
        unclosed++;
      }
    }
  }
  unclosed += stack.length;
  const latexConfidence = Math.max(0, 1.0 - (0.15 * unclosed));

  // Compute composite score using the new formula weights (Phase 9)
  let composite = (ocr * 0.15) +
                  (parser * 0.15) +
                  (layout * 0.10) +
                  (sect * 0.10) +
                  (structuralConfidence * 0.15) +
                  (semanticConfidence * 0.15) +
                  (optionIntegrity * 0.10) +
                  (boundaryConfidence * 0.10);

  const clampedComposite = Math.max(0, Math.min(1, composite));

  return {
    ocrConfidence: ocr,
    parserConfidence: parser,
    layoutConfidence: layout,
    sectionConfidence: sect,
    boundaryConfidence,
    optionIntegrityConfidence: optionIntegrity,
    completenessScore: extraSignals.completenessScore != null ? extraSignals.completenessScore : 1.0,
    semanticConfidence,
    structuralConfidence,
    latexConfidence,
    composite: clampedComposite,
    rating: clampedComposite >= 0.75 ? 'high' : clampedComposite >= 0.50 ? 'medium' : 'low',
    breakdown: {
      ocr: (ocr * 0.15).toFixed(3),
      parser: (parser * 0.15).toFixed(3),
      layout: (layout * 0.10).toFixed(3),
      section: (sect * 0.10).toFixed(3),
      structural: (structuralConfidence * 0.15).toFixed(3),
      semantic: (semanticConfidence * 0.15).toFixed(3),
      optionIntegrity: (optionIntegrity * 0.10).toFixed(3),
      boundary: (boundaryConfidence * 0.10).toFixed(3)
    }
  };
}

// ─── 7. UNIFIED OCR PIPELINE ─────────────────────────────────────────────────
class OCRPipeline {
  /**
   * Run the full document-understanding OCR pipeline on an image buffer.
   * @param {Buffer} buffer   - Raw image buffer from multer memoryStorage
   * @param {string} mimetype - MIME type (e.g. 'image/jpeg')
   * @param {string} filename - Original filename
   */
  static async runFromBuffer(buffer, mimetype, filename) {
    // ── Layer 1: Upload validation ────────────────────────────────────────
    UploadHandler.validate({ buffer, mimetype, size: buffer.length });

    // ── Layer 2: Image preprocessing ─────────────────────────────────────
    let preprocessInfo = null;
    let workingBuffer  = buffer;
    try {
      preprocessInfo = await ImagePreprocessor.preprocessBuffer(buffer);
      workingBuffer  = preprocessInfo.buffer;
    } catch (err) {
      console.warn('[OCRPipeline] Image preprocessing failed, proceeding with original buffer:', err.message);
    }

    // ── Layer 3: OCR provider ─────────────────────────────────────────────
    let ocrResult;
    try {
      ocrResult = await OCRProviderAdapter.processImage(workingBuffer, mimetype, filename);
    } catch (err) {
      console.error('[OCRPipeline] OCR Provider Adapter failure, calling recovery engine:', err.message);
      const fallbackItem = OCRRecoveryEngine.generateFallbackQuestion(err, filename);
      return {
        rawText: '', latex: '', parsedQuestions: [fallbackItem],
        confidence: 0.0, qualityRating: 'low', isValid: false,
        pageType: 'UNKNOWN_PAGE',
        detectionQuality: { source: 'recovery', multipleDetected: false, questionCount: 1 }
      };
    }

    const parseResult = await this.runParsing(ocrResult, filename);
    if (parseResult.blocked) {
      return parseResult.blockedResponse;
    }

    return this.runValidation(
      parseResult.parsedQuestions,
      ocrResult,
      parseResult.pageType,
      parseResult.sections,
      parseResult.totalRejected,
      preprocessInfo,
      filename,
      parseResult.answerKeys || []
    );
  }

  /**
   * Run Layout analysis, page classification, and question parsing on raw OCR output.
   */
  static async runParsing(ocrResult, filename) {
    let { rawText, latex: rawLatex, confidence } = ocrResult;
    const ocrConf = confidence !== null ? confidence : 1.0;

    // Clean raw text and latex before parsing (Phase 4: Footer/Header Removal)
    const cleanDocText = (text) => {
      if (!text) return '';
      return text.split('\n').filter(line => {
        const trimmed = line.trim();
        if (/^Prepared by.*/i.test(trimmed)) return false;
        if (/^Downloaded from.*/i.test(trimmed)) return false;
        if (/^Page\s+\d+/i.test(trimmed)) return false;
        if (/^www\./i.test(trimmed)) return false;
        if (/^https?:\/\/.*/i.test(trimmed)) return false;
        if (/^Copyright.*/i.test(trimmed)) return false;
        if (/^All rights reserved.*/i.test(trimmed)) return false;
        return true;
      }).join('\n');
    };

    rawText = cleanDocText(rawText);
    rawLatex = cleanDocText(rawLatex);
    
    ocrResult.rawText = rawText;
    ocrResult.latex = rawLatex;

    // ── Layer 4: Page Classification (DOCUMENT UNDERSTANDING) ─────────────
    const textForClassification = rawLatex || rawText;
    const pageClassification = PageClassificationEngine.classifyPage(textForClassification);
    
    // Detect if there are multiple sections in the text
    const hasMultipleSections = PageClassificationEngine.extractSections(textForClassification).length > 1;

    // Fast-path eligibility check: Clean MCQ page + High OCR confidence + Strong classification signal + Single Section only
    const isFastPath = 
      pageClassification.pageType === 'MCQ_PAGE' && 
      ocrConf >= 0.85 && 
      pageClassification.confidence >= 0.80 &&
      !hasMultipleSections;

    if (isFastPath) {
      console.log('[OCRPipeline] >>> FAST PATH TRIGGERED <<< (Clean MCQ layout + High Confidence)');
      
      const normalizedText = OCRNormalizer.normalizeText(textForClassification);
      const sanitizedLatex = LatexSanitizer.sanitize(textForClassification, ocrConf);

      // Fast Path: Directly segment and parse as MCQ. Skip Layout analysis, section splitting, and block classification.
      const sectionSegments = QuestionSegmenter.segment(sanitizedLatex);
      const parsedQuestions = [];
      let globalOrder = 0;
      const seenNumbers = new Set();

      for (let idx = 0; idx < sectionSegments.length; idx++) {
        const seg = sectionSegments[idx];
        if (!seg.text || !seg.text.trim()) continue;

        // Skip block classification, skip repeated parser routing, directly parse as MCQ
        const parsedBlock = MCQOptionParser.parse(seg.text.trim());
        if (!parsedBlock) continue;

        const questionNum = seg.number || String(idx + 1);
        const questionText = parsedBlock.question;

        // Skip duplicates and invalid segments
        if (questionText.length < 5 || seenNumbers.has(questionNum)) {
          continue;
        }

        globalOrder++;
        parsedQuestions.push({
          question: questionText,
          options: (parsedBlock.options || []).map(o => ({ label: o.label, text: truncateFooterLeak(o.text) })),
          columnA: [],
          columnB: [],
          matchingChoices: [],
          blanks: [],
          blankCount: 0,
          format: parsedBlock.format || 'mcq',
          questionNumber: questionNum,
          rawChunk: seg.text,
          detectionOrder: globalOrder,
          effectiveParserType: 'MCQ',
          blockClass: { confidence: 0.95 },
          sectionTitle: 'Default',
          sectionConfidence: 0.95,
          sourceUsed: 'fast-path-mcq',
          layoutMetadata: { strategy: 'fast-path' },
          fastPath: true
        });

        seenNumbers.add(questionNum);
      }

      return {
        blocked: false,
        parsedQuestions,
        pageType: pageClassification.pageType,
        sections: [{ title: 'Default', parserType: 'MCQ' }],
        totalRejected: 0
      };
    }

    // ── SAFE PATH (Fallback) ─────────────────────────────────────────────
    console.log('[OCRPipeline] >>> SAFE PATH TRIGGERED <<< (Mixed/low-confidence/complex layout)');

    // ── Layer 3.5: Layout Analysis Engine ────────────────────────────────
    let layoutText = rawLatex || rawText;
    let layoutMetadata = { strategy: 'raw-fallback' };
    try {
      const layoutAnalysis = LayoutAnalysisEngine.analyze(ocrResult);
      layoutText = layoutAnalysis.text;
      layoutMetadata = layoutAnalysis.layoutMetadata;
    } catch (layoutErr) {
      console.warn('[OCRPipeline] LayoutAnalysisEngine failed, using raw output:', layoutErr.message);
    }

    // Re-classify page on layout-analyzed text to be safe
    const safePageClassification = PageClassificationEngine.classifyPage(layoutText);

    // ── Layer 5: Answer Key & Theory Page Blocking ───────────────────────
    const isAnsKey =
      safePageClassification.pageType === 'ANSWER_KEY_PAGE' ||
      ContentClassificationEngine.isAnswerKeyPage(layoutText);

    if (isAnsKey) {
      console.log('[OCRPipeline] ANSWER_KEY_PAGE detected. Parsing answer keys.');
      const keys = parseAnswerKeys(layoutText);
      return {
        blocked: false,
        parsedQuestions: [],
        answerKeys: keys,
        pageType: 'ANSWER_KEY_PAGE',
        sections: [{ title: 'Answers', parserType: 'ANSWER_KEY' }],
        totalRejected: 0
      };
    }

    const isTheoryPage = safePageClassification.pageType === 'THEORY_PAGE';
    if (isTheoryPage) {
      console.log('[OCRPipeline] THEORY_PAGE detected. Blocking all content.');
      return {
        blocked: true,
        blockedResponse: {
          rawText: rawText || '', latex: rawLatex || '', parsedQuestions: [],
          confidence: ocrConf, qualityRating: 'high', isValid: false,
          pageType: 'THEORY_PAGE',
          detectionQuality: { source: 'classifier', multipleDetected: false, questionCount: 0 }
        }
      };
    }

    // ── Layer 6: OCR Recovery (low confidence / empty) ────────────────────
    if (OCRRecoveryEngine.needsRecovery({ rawText, latex: rawLatex, confidence })) {
      console.warn('[OCRPipeline] Low confidence OCR output, engaging recovery engine.');
      const fallbackItem = OCRRecoveryEngine.generateFallbackQuestion(rawText || 'Low confidence OCR output', filename);
      return {
        blocked: true,
        blockedResponse: {
          rawText: rawText || '', latex: rawLatex || '', parsedQuestions: [fallbackItem],
          confidence: ocrConf, qualityRating: 'low', isValid: false,
          pageType: safePageClassification.pageType,
          detectionQuality: { source: 'recovery', multipleDetected: false, questionCount: 1 }
        }
      };
    }

    // ── Layer 7: Text normalization & LaTeX sanitization ──────────────────
    const normalizedText = OCRNormalizer.normalizeText(layoutText);
    const sanitizedLatex = LatexSanitizer.sanitize(layoutText, ocrConf);

    // ── Layer 8: Section Extraction (BEFORE segmentation) ─────────────────
    const latexSections = PageClassificationEngine.extractSections(sanitizedLatex);
    const textSections  = PageClassificationEngine.extractSections(normalizedText);

    // Choose the source with more sections
    const useSections = latexSections.length >= textSections.length ? latexSections : textSections;
    const useText     = latexSections.length >= textSections.length ? sanitizedLatex  : normalizedText;
    let   sourceUsed  = latexSections.length >= textSections.length ? 'latex'         : 'rawText';

    console.log(`[OCRPipeline] Sections detected: ${useSections.length}`, useSections.map(s => `"${s.title}" → ${s.parserType}`));

    // ── Layer 9: Build section text slices ────────────────────────────────
    const sectionSlices = useSections.map((sec, i) => {
      const nextSec  = useSections[i + 1];
      const start    = sec.startIndex;
      const end      = nextSec ? nextSec.startIndex : useText.length;
      const sliceRaw = useText.substring(start, end);
      const sliceClean = sec.title === 'Default' ? sliceRaw.trim() : sliceRaw.replace(/^[^\n]*\n/, '').trim();

      return {
        title:      sec.title,
        parserType: sec.parserType,
        text:       sliceClean,
        confidence: sec.confidence,
      };
    });

    // ── Layer 10: Per-section segmentation and routing ────────────────────
    const parsedQuestions = [];
    const answerKeys      = [];
    let   globalOrder     = 0;
    let   totalRejected   = 0;

    for (const section of sectionSlices) {
      if (section.parserType === PARSER_TYPES.ANSWER_KEY) {
        const keys = parseAnswerKeys(section.text);
        answerKeys.push(...keys);
        continue;
      }
      if (section.parserType === PARSER_TYPES.THEORY) {
        console.log(`[OCRPipeline] Skipping ignored section: "${section.title}" (${section.parserType})`);
        continue;
      }

      if (!section.text.trim()) continue;

      const sectionSeenNumbers = new Set();
      let sectionSegments = QuestionSegmenter.segment(section.text);

      if (sectionSegments.length === 0 && section.text.trim().length > 10) {
        sectionSegments = [{
          text:    section.text.trim(),
          number:  null,
          startIndex: 0,
          endIndex:   section.text.length,
          rawHeader: '',
        }];
      }

      // Optimize: Classify parser once per section, do NOT re-run block classification for every segment
      const sectionParserType = section.parserType || PARSER_TYPES.MCQ;

      for (let idx = 0; idx < sectionSegments.length; idx++) {
        try {
          const seg = sectionSegments[idx];
          if (!seg.text || !seg.text.trim()) continue;

          // Route directly using the section parser type (Part 2)
          const parsedBlock = routeToParser(seg.text, sectionParserType, ocrConf);

          const questionNum = seg.number || String(idx + 1);
          const sanitizedQuestion = LatexSanitizer.sanitize(parsedBlock.question, ocrConf);

          const filter = preFilterSegment(sanitizedQuestion, questionNum, sectionSeenNumbers);
          let isFragmentOrKey = false;
          if (filter.skip) {
            if (filter.reason.startsWith('Fragment too short') || filter.reason.startsWith('Answer key fragment') || filter.reason.startsWith('Section header')) {
              isFragmentOrKey = true;
            }
          }

          if (isFragmentOrKey) {
            console.log(`[OCRPipeline] Pre-filter rejected segment: ${filter.reason}`);
            totalRejected++;
            continue;
          }

          const sanitizedOptions  = (parsedBlock.options || []).map(o => ({
            label: o.label,
            text:  truncateFooterLeak(LatexSanitizer.sanitize(o.text, ocrConf)),
          }));

          globalOrder++;
          parsedQuestions.push({
            question: sanitizedQuestion,
            options: sanitizedOptions,
            columnA: parsedBlock.columnA || [],
            columnB: parsedBlock.columnB || [],
            matchingChoices: parsedBlock.matchingChoices || [],
            blanks: parsedBlock.blanks || [],
            blankCount: parsedBlock.blankCount || 0,
            format: parsedBlock.format || 'descriptive',
            questionNumber: questionNum,
            rawChunk: seg.text,
            detectionOrder: globalOrder,
            effectiveParserType: sectionParserType,
            blockClass: { confidence: 0.8 },
            sectionTitle: section.title,
            sectionConfidence: section.confidence,
            sourceUsed,
            layoutMetadata
          });

          sectionSeenNumbers.add(questionNum);
        } catch (segmentErr) {
          console.error(`[OCRPipeline] Error processing segment:`, segmentErr);
        }
      }
    }

    return {
      blocked: false,
      parsedQuestions,
      answerKeys,
      pageType: safePageClassification.pageType,
      sections: useSections.map(s => ({ title: s.title, parserType: s.parserType })),
      totalRejected
    };
  }

  /**
   * Run structural validation, confidence scoring, and quarantining.
   */
  static runValidation(parsedQuestions, ocrResult, pageType, sections, totalRejected, preprocessInfo, filename, answerKeys = []) {
    const { rawText, latex: rawLatex, confidence } = ocrResult;
    const sanitizedLatex = LatexSanitizer.sanitize(rawLatex || rawText, confidence);
    const finalQuestions = [];

    const sectionSeenNumbers = new Set();
    let totalRejectedFromValidation = totalRejected;
    let sourceUsed = 'unknown';

    // Optimize: only check overlapping boxes once per page if NOT fast path
    const isFastPath = parsedQuestions.length > 0 && parsedQuestions[0].fastPath;
    const hasOverlapping = !isFastPath && detectOverlappingBoxes(ocrResult.ocr?.lines || ocrResult.lines);

    // Build a map of qNum -> ans for mapping answer keys
    const answerKeyMap = new Map();
    if (Array.isArray(answerKeys) && answerKeys.length > 0) {
      answerKeys.forEach(k => {
        answerKeyMap.set(k.questionNumber, k.correctAnswer);
      });
    }

    for (const q of parsedQuestions) {
      try {
        const parsedBlock = {
          question: q.question,
          options: q.options,
          columnA: q.columnA,
          columnB: q.columnB,
          matchingChoices: q.matchingChoices,
          blanks: q.blanks,
          blankCount: q.blankCount,
          format: q.format
        };

        sourceUsed = q.sourceUsed || 'unknown';

        // Check if an answer key was mapped for this specific question
        let correctAnswer = '';
        let correctAnswerMapped = false;
        const numMatch = String(q.questionNumber).match(/(\d+)$/);
        if (numMatch) {
          const num = parseInt(numMatch[1], 10);
          if (answerKeyMap.has(num)) {
            correctAnswer = answerKeyMap.get(num);
            correctAnswerMapped = true;
          }
        }

        // Fast-path: skip heavy confidence computation, skip repeated evaluations
        const confScore = isFastPath
          ? {
              composite: 0.95,
              rating: 'high',
              ocrConfidence: confidence ?? 0.95,
              parserConfidence: 0.95,
              layoutConfidence: 0.95,
              sectionConfidence: 0.95,
              structuralConfidence: 1.0,
              latexConfidence: 1.0,
              semanticConfidence: 1.0,
              optionIntegrityConfidence: 1.0,
              boundaryConfidence: 1.0,
              answerKeyIntegrity: 1.0,
              completenessScore: 1.0
            }
          : computeConfidenceScore(
              confidence,
              q.blockClass?.confidence ?? 0.8,
              0.8, // page classification baseline
              q.sectionConfidence,
              q.rawChunk,
              parsedBlock,
              q.questionNumber,
              { correctAnswerMapped }
            );

        // ── SECTION 3: HEADING DETECTION ──
        const isHeading = (
          (q.options || []).filter(o => o.text && o.text.trim().length > 0).length === 0 &&
          !q.question.includes("?") &&
          !/^Q\d+/i.test(q.question) &&
          q.question.length < 120 &&
          ["chapter", "unit", "exercise", "test", "mock", "section", "topic"].some(kw => q.question.toLowerCase().includes(kw))
        );

        if (isHeading) {
          console.log(`[OCRPipeline] SKIP_AS_HEADING detected: "${q.question}"`);
          continue; // Do not store, do not quarantine, do not count
        }

        const enrichedQuestion = {
          question: OCRNormalizer.cleanQuestionText(q.question),
          options: q.options,
          columnA: q.columnA,
          columnB: q.columnB,
          matchingChoices: q.matchingChoices,
          blanks: q.blanks,
          blankCount: q.blankCount,
          format: q.format,
          questionNumber: q.questionNumber,
          rawChunk: q.rawChunk,
          ocrConfidence: confidence,
          detectionOrder: q.detectionOrder,
          verified: false,
          confidenceScores: confScore,
          correctAnswer, // Auto-populated correct answer!
          rawOcrData: {
            sourceUsed: q.sourceUsed,
            rawText: q.rawChunk, // Optimized: store only question chunk, not full page!
            rawLatex: q.rawChunk,
            sanitizedLatex: q.rawChunk,
            confidence,
            chunkText: q.rawChunk,
            preprocessing: preprocessInfo ? preprocessInfo.diagnostics : null,
            preprocessingQuality: preprocessInfo ? preprocessInfo.qualityRating : null,
            layout: q.layoutMetadata,
            diagnostics: {
              rawOcr: q.rawChunk,
              normalizedOcr: q.question,
              parserModifications: q.format,
              confidenceScore: confidence,
              pageType: pageType,
              sectionDetected: q.sectionTitle,
              parserType: q.effectiveParserType,
              blockClassification: q.blockClass,
              answerPageDetected: pageType === 'ANSWER_KEY_PAGE',
              tableDetected: q.effectiveParserType === PARSER_TYPES.TABLE,
              fillDetected: q.effectiveParserType === PARSER_TYPES.FILL,
            },
          },
        };

        // Fast-path: skip heavy validation checklist
        const validationResult = isFastPath
          ? { isValid: true, errors: [] }
          : QuestionValidator.validate(enrichedQuestion);
        
        enrichedQuestion.validation = validationResult;

        const quarantineReasons = [];

        // ── PHASE 8: SMART QUARANTINE LOGIC ─────────────────────────────────────
        const isMCQFormatQ = ['mcq', 'line-based', 'inline-mcq', 'structured'].includes(enrichedQuestion.format);
        const optionsFilled = (enrichedQuestion.options || []).filter(o => (typeof o === 'object' ? o.text : o) && String(typeof o === 'object' ? o.text : o).trim()).length;

        // 1. MISSING_QUESTION
        if (enrichedQuestion.question.length < 5 || /^(?:Question\s*(?:Text)?|Q\.?No\.?)$/i.test(enrichedQuestion.question)) {
          quarantineReasons.push('MISSING_QUESTION');
        }

        // 2. MISSING_OPTIONS
        if (isMCQFormatQ && optionsFilled === 0) {
          quarantineReasons.push('MISSING_OPTIONS');
        }

        // 3. EXCESSIVE_GARBAGE / OCR_CORRUPTION
        const garbageRatio = calculateGarbageRatio(enrichedQuestion.question);
        if (garbageRatio > 0.30) {
          quarantineReasons.push('OCR_CORRUPTION');
        }

        // 4. INVALID_LATEX
        const { LatexSanitizer: sanitizerInstance } = require('./latexSanitizer');
        const isUnbalancedLatex = confScore.latexConfidence < 0.60 || !sanitizerInstance.isValidLatexSyntax(enrichedQuestion.question);
        if (isUnbalancedLatex) {
          quarantineReasons.push('INVALID_LATEX');
        }

        // 5. PARSER_FAILURE
        if (confScore.parserConfidence < 0.40) {
          quarantineReasons.push('PARSER_FAILURE');
        }

        // 6. OCR_CORRUPTION specific triggers (Section 9)
        const repeatedSymbols = /([!@#$%^&*()_+={}\[\]|\\:;"'<>,.?\/~`\-]){4,}/.test(enrichedQuestion.question);
        const excessNoise = garbageRatio > 0.40;
        const isOcrCorrupted = repeatedSymbols || excessNoise || isUnbalancedLatex || confScore.parserConfidence < 0.40;
        if (isOcrCorrupted && !quarantineReasons.includes('OCR_CORRUPTION')) {
          quarantineReasons.push('OCR_CORRUPTION');
        }

        // ── EXTRACTION STATE DECISION (Section 2) ──────────────────────────
        let extractionState = 'MANUAL_REVIEW';
        const composite = confScore.composite;
        const validQuestionStructure = enrichedQuestion.question.trim().length > 10 && (!isMCQFormatQ || optionsFilled >= 2);
        const semanticValidationPassed = confScore.semanticConfidence >= 0.75;

        const hasQuarantineSignal = (
          composite < 0.50 ||
          !enrichedQuestion.question || enrichedQuestion.question.trim().length === 0 ||
          (isMCQFormatQ && optionsFilled === 0) ||
          garbageRatio > 0.30 ||
          isUnbalancedLatex ||
          confScore.parserConfidence < 0.40
        );

        if (hasQuarantineSignal) {
          extractionState = 'QUARANTINED';
        } else if (composite >= 0.75 && validQuestionStructure && semanticValidationPassed) {
          extractionState = 'ACCEPTED'; // maps to VERIFIED
        } else if (composite >= 0.50) {
          extractionState = 'MANUAL_REVIEW'; // maps to REVIEW
        } else {
          extractionState = 'QUARANTINED';
        }

        // Keep final quarantine status override
        if (quarantineReasons.length > 0) {
          extractionState = 'QUARANTINED';
        }

        enrichedQuestion.extractionState = extractionState;
        enrichedQuestion.quarantineReasons = quarantineReasons;
        enrichedQuestion.quarantined = extractionState === 'QUARANTINED';

        // Log observability info (Section 10)
        console.log("[OCRPipeline] Extracted Question Info:", JSON.stringify({
          questionNumber: enrichedQuestion.questionNumber,
          compositeConfidence: confScore.composite,
          ocrConfidence: confScore.ocrConfidence,
          parserConfidence: confScore.parserConfidence,
          semanticConfidence: confScore.semanticConfidence,
          finalDecision: extractionState === 'ACCEPTED' ? 'VERIFIED' : (extractionState === 'MANUAL_REVIEW' ? 'REVIEW' : 'QUARANTINED'),
          quarantineReasons
        }));

        if (extractionState === 'REJECTED') {
          totalRejectedFromValidation++;
          continue;
        }

        const previewData = PreviewRenderer.prepareQuestionPreview({
          questionText: enrichedQuestion.question,
          options: enrichedQuestion.options,
          questionNumber: enrichedQuestion.questionNumber,
          detectionOrder: enrichedQuestion.detectionOrder,
        });
        if (previewData) enrichedQuestion.preview = previewData;

        const sectionKey = `${q.sectionTitle || 'Default'}_${q.questionNumber}`;
        sectionSeenNumbers.add(sectionKey);
        finalQuestions.push(enrichedQuestion);
      } catch (err) {
        console.error('[OCRPipeline] runValidation error: ', err);
      }
    }

    const pipelineValidation = OCRResultValidator.validate(rawText, sanitizedLatex, confidence);

    return {
      rawText: rawText || '',
      latex: sanitizedLatex,
      parsedQuestions: finalQuestions,
      confidence: pipelineValidation.confidence,
      qualityRating: pipelineValidation.rating,
      isValid: pipelineValidation.isValid,
      pageType: pageType,
      sections: sections,
      totalRejected: totalRejectedFromValidation,
      detectionQuality: {
        source: sourceUsed,
        multipleDetected: finalQuestions.length > 1,
        questionCount: finalQuestions.length,
      },
    };
  }

  /**
   * Helper utility for base64 / URL strings (compatibility handler).
   */
  static async run(src) {
    let buffer;
    let mimetype = 'image/jpeg';
    let filename = 'image.jpg';

    if (src.startsWith('data:')) {
      const [meta, b64] = src.split(',');
      const mimeMatch   = meta.match(/data:([^;]+);/);
      if (mimeMatch) mimetype = mimeMatch[1];
      buffer = Buffer.from(b64, 'base64');
    } else if (src.startsWith('http')) {
      const fetchModule = await import('node-fetch');
      const fetch       = fetchModule.default;
      const resp        = await fetch(src);
      buffer = Buffer.from(await resp.arrayBuffer());
      const ct = resp.headers.get('content-type');
      if (ct) mimetype = ct.split(';')[0].trim();
    } else {
      buffer = Buffer.from(src, 'base64');
    }

    return this.runFromBuffer(buffer, mimetype, filename);
  }
}

module.exports = {
  QuestionSegmenter,
  MCQDetector,
  LatexSanitizer,
  // QuestionQueueManager,
  OCRResultValidator,
  OCRPipeline,
  isQuestionCandidate,
  parseAnswerKeys,
};
