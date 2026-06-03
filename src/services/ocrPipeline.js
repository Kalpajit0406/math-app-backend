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
 * Quick pre-filter check BEFORE creating the full enriched object.
 * Returns { skip: true, reason } if this segment should be discarded.
 */
function preFilterSegment(questionText, questionNum, seenNumbers) {
  const text = questionText.trim();

  if (text.length < 5) {
    return { skip: true, reason: `Fragment too short (${text.length} chars)` };
  }

  // Section header leaked through
  if (
    ContentClassificationEngine.classifyLine(text) === 'SECTION_TITLE' ||
    /^(?:Conventional\s*Type|Multiple\s*Choice\s*Questions|Fill\s*in\s*the\s*Blank|Column\s*Matching|Analytical\s*Type|Short\s*Answer\s*Type|Long\s*Answer\s*Type|উত্তরমালা)\s*$/i.test(text) ||
    /\b(?:exercise|chapter|ch\.)\s*\d/i.test(text)
  ) {
    return { skip: true, reason: `Section header: "${text}"` };
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

// ─── 6. CONFIDENCE SCORER ────────────────────────────────────────────────────
/**
 * Compute a composite confidence score from OCR and parser signals.
 */
function computeConfidenceScore(ocrConfidence, parserConfidence, layoutConfidence, sectionConfidence, segmentText, parsedBlock, questionNumber) {
  const ocr    = ocrConfidence    != null ? ocrConfidence    : 0.80;
  const parser = parserConfidence != null ? parserConfidence : 0.70;
  const layout = layoutConfidence != null ? layoutConfidence : 0.80;
  const sect   = sectionConfidence != null ? sectionConfidence : 0.80;

  const questionText = (segmentText || parsedBlock?.question || '').trim();

  // 1. Structural confidence
  let structuralConfidence = 1.0;
  if (questionText.length < 20) structuralConfidence -= 0.15;
  if (questionText.length < 10) structuralConfidence -= 0.20;

  const format = (parsedBlock?.format || '').toLowerCase();
  const options = parsedBlock?.options || [];
  const filledOptions = options.filter(o => o.text && o.text.trim().length > 0).length;

  if (['mcq', 'line-based', 'inline-mcq', 'structured'].includes(format)) {
    if (filledOptions < 4) structuralConfidence -= 0.15;
    if (filledOptions < 2) structuralConfidence -= 0.35;
  }
  structuralConfidence = Math.max(0, structuralConfidence);

  // 2. LaTeX confidence: deduct 0.15 per unmatched bracket/brace/parenthesis
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

  // 3. Semantic confidence
  let semanticConfidence = 1.0;
  const mathKeywords = /\b(?:find|evaluate|solve|equals?|determine|calculate|prove|show|simplify|integrate|differentiate|matrix|equation|probability|triangle|circle|derivative|angle|sum|product|ratio|fraction|expression|value|what|how|where|prove|verify|construct)\b/i;
  const cleanText = questionText.replace(/\s+/g, '');
  if (cleanText.length > 0) {
    const validChars = cleanText.match(/[a-zA-Z0-9+\-=*/^$\\_{}[\]()|<>.,;?!]/g) || [];
    const validRatio = validChars.length / cleanText.length;
    if (validRatio < 0.60) {
      semanticConfidence = 0.40;
    } else if (!mathKeywords.test(questionText)) {
      semanticConfidence = 0.70;
    } else {
      semanticConfidence = 1.0;
    }
  } else {
    semanticConfidence = 0.40;
  }

  // 4. Option integrity confidence
  let optionIntegrityConfidence = 1.0;
  if (['mcq', 'line-based', 'inline-mcq', 'structured'].includes(format)) {
    if (filledOptions >= 4) optionIntegrityConfidence = 1.0;
    else if (filledOptions === 3) optionIntegrityConfidence = 0.75;
    else if (filledOptions === 2) optionIntegrityConfidence = 0.50;
    else optionIntegrityConfidence = 0.0;
  } else {
    if (filledOptions > 0) optionIntegrityConfidence = 0.50;
  }

  // 5. Question-boundary confidence
  let boundaryConfidence = questionNumber != null ? 1.0 : 0.70;
  const bleedRegex = /(?:\n\s*\d+[\s.)]|\s+\([b-z]\)\s+|\bQ\d+\b)/;
  if (bleedRegex.test(questionText)) {
    boundaryConfidence = Math.max(0, boundaryConfidence - 0.25);
  }

  // Weighted composite score
  const composite = (ocr * 0.25) +
                    (layout * 0.15) +
                    (parser * 0.15) +
                    (structuralConfidence * 0.15) +
                    (latexConfidence * 0.10) +
                    (semanticConfidence * 0.10) +
                    (optionIntegrityConfidence * 0.05) +
                    (boundaryConfidence * 0.05);

  return {
    ocrConfidence:             ocr,
    parserConfidence:          parser,
    layoutConfidence:          layout,
    sectionConfidence:         sect,
    structuralConfidence,
    latexConfidence,
    semanticConfidence,
    optionIntegrityConfidence,
    boundaryConfidence,
    composite:                 Math.max(0, Math.min(1, composite)),
    rating: composite >= 0.90 ? 'high' : composite >= 0.75 ? 'medium' : 'low',
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
      filename
    );
  }

  /**
   * Run Layout analysis, page classification, and question parsing on raw OCR output.
   */
  static async runParsing(ocrResult, filename) {
    const { rawText, latex: rawLatex, confidence } = ocrResult;

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

    // ── Layer 4: Page Classification (DOCUMENT UNDERSTANDING) ─────────────
    const pageClassification = PageClassificationEngine.classifyPage(layoutText);
    console.log('[OCRPipeline] Page Classification:', {
      pageType:          pageClassification.pageType,
      defaultParser:     pageClassification.defaultParserType,
      confidence:        pageClassification.confidence,
      diagnostics:       pageClassification.diagnostics,
    });

    // ── Layer 5: Answer Key & Theory Page Blocking ───────────────────────
    const isAnsKey =
      pageClassification.pageType === 'ANSWER_KEY_PAGE' ||
      ContentClassificationEngine.isAnswerKeyPage(layoutText);

    if (isAnsKey) {
      console.log('[OCRPipeline] ANSWER_KEY_PAGE detected. Blocking all content.');
      return {
        blocked: true,
        blockedResponse: {
          rawText: rawText || '', latex: rawLatex || '', parsedQuestions: [],
          confidence: confidence ?? 1.0, qualityRating: 'high', isValid: false,
          pageType: 'ANSWER_KEY_PAGE',
          detectionQuality: { source: 'classifier', multipleDetected: false, questionCount: 0 }
        }
      };
    }

    const isTheoryPage = pageClassification.pageType === 'THEORY_PAGE';
    if (isTheoryPage) {
      console.log('[OCRPipeline] THEORY_PAGE detected. Blocking all content.');
      return {
        blocked: true,
        blockedResponse: {
          rawText: rawText || '', latex: rawLatex || '', parsedQuestions: [],
          confidence: confidence ?? 1.0, qualityRating: 'high', isValid: false,
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
          confidence: confidence ?? 0.0, qualityRating: 'low', isValid: false,
          pageType: pageClassification.pageType,
          detectionQuality: { source: 'recovery', multipleDetected: false, questionCount: 1 }
        }
      };
    }

    // ── Layer 7: Text normalization & LaTeX sanitization ──────────────────
    const normalizedText = OCRNormalizer.normalizeText(layoutText);
    const sanitizedLatex = LatexSanitizer.sanitize(layoutText, confidence);

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
    let   globalOrder     = 0;
    let   totalRejected   = 0;

    for (const section of sectionSlices) {
      if (section.parserType === PARSER_TYPES.ANSWER_KEY || section.parserType === PARSER_TYPES.THEORY) {
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

      for (let idx = 0; idx < sectionSegments.length; idx++) {
        try {
          const seg = sectionSegments[idx];
          if (!seg.text || !seg.text.trim()) continue;

          const blockClass = PageClassificationEngine.classifyBlock(seg.text, section.parserType);

          if (blockClass.parserType === PARSER_TYPES.ANSWER_KEY) {
            console.log(`[OCRPipeline] Block-level answer key detected — skipping.`);
            continue;
          }

          const effectiveParserType = blockClass.parserType;
          const parsedBlock = routeToParser(seg.text, effectiveParserType, confidence);

          const questionNum = seg.number || String(idx + 1);
          const sanitizedQuestion = LatexSanitizer.sanitize(parsedBlock.question, confidence);

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
            text:  LatexSanitizer.sanitize(o.text, confidence),
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
            effectiveParserType,
            blockClass,
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
      pageType: pageClassification.pageType,
      sections: useSections.map(s => ({ title: s.title, parserType: s.parserType })),
      totalRejected
    };
  }

  /**
   * Run structural validation, confidence scoring, and quarantining.
   */
  static runValidation(parsedQuestions, ocrResult, pageType, sections, totalRejected, preprocessInfo, filename) {
    const { rawText, latex: rawLatex, confidence } = ocrResult;
    const sanitizedLatex = LatexSanitizer.sanitize(rawLatex || rawText, confidence);
    const finalQuestions = [];

    const sectionSeenNumbers = new Set();
    let totalRejectedFromValidation = totalRejected;
    let sourceUsed = 'unknown';

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

        const confScore = computeConfidenceScore(
          confidence,
          q.blockClass?.confidence ?? 0.8,
          0.8, // page classification baseline
          q.sectionConfidence,
          q.rawChunk,
          parsedBlock,
          q.questionNumber
        );

        const enrichedQuestion = {
          question: q.question,
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
          rawOcrData: {
            sourceUsed: q.sourceUsed,
            rawText,
            rawLatex,
            sanitizedLatex,
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

        const validationResult = QuestionValidator.validate(enrichedQuestion);
        enrichedQuestion.validation = validationResult;

        const quarantineReasons = [];
        if (confScore.ocrConfidence < 0.70) quarantineReasons.push('low_ocr_confidence');
        if (confScore.latexConfidence < 0.80) quarantineReasons.push('malformed_latex');
        if (confScore.parserConfidence < 0.70) quarantineReasons.push('parser_ambiguity');
        
        const hasOverlapping = detectOverlappingBoxes(ocrResult.ocr?.lines || ocrResult.lines);
        if (hasOverlapping) quarantineReasons.push('overlapping_bounding_boxes');

        const duplicateQuestion = sectionSeenNumbers.has(q.questionNumber);
        if (duplicateQuestion) quarantineReasons.push('duplicate_question_number');

        if (['mcq', 'line-based', 'inline-mcq', 'structured'].includes(enrichedQuestion.format)) {
          if (confScore.optionIntegrityConfidence < 1.0) {
            quarantineReasons.push('malformed_options_array');
          }
        }

        if (pageType === 'UNKNOWN_PAGE') {
          quarantineReasons.push('unsupported_layout');
        }

        if (preprocessInfo?.diagnostics?.isLowLight || preprocessInfo?.diagnostics?.issues?.includes('low_light')) {
          quarantineReasons.push('low_light_image');
        }

        if (preprocessInfo?.diagnostics?.isBlurred || preprocessInfo?.diagnostics?.issues?.includes('blur') || preprocessInfo?.diagnostics?.issues?.includes('low_contrast')) {
          quarantineReasons.push('blur_threshold_exceeded');
        }

        const bleedRegex = /(?:\n\s*\d+[\s.)]|\s+\([b-z]\)\s+|\bQ\d+\b)/;
        if (bleedRegex.test(q.question)) {
          quarantineReasons.push('parser_contamination_suspected');
        }

        if (!validationResult.isValid) {
          quarantineReasons.push(...validationResult.errors);
        }

        let extractionState = 'ACCEPTED';
        const composite = confScore.composite;
        if (composite >= 0.90) {
          extractionState = 'ACCEPTED';
        } else if (composite >= 0.75) {
          extractionState = 'MANUAL_REVIEW';
        } else if (composite >= 0.60) {
          extractionState = 'QUARANTINED';
        } else {
          extractionState = 'REJECTED';
        }

        if (quarantineReasons.length > 0 && extractionState !== 'REJECTED') {
          extractionState = 'QUARANTINED';
        }

        enrichedQuestion.extractionState = extractionState;
        enrichedQuestion.quarantineReasons = quarantineReasons;
        enrichedQuestion.quarantined = extractionState === 'QUARANTINED';

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

        sectionSeenNumbers.add(q.questionNumber);
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
};
