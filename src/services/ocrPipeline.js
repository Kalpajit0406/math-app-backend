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
    /^(?:Conventional\s*Type|Multiple\s*Choice\s*Questions|Fill\s*in\s*the\s*Blank|Column\s*Matching|Analytical\s*Type|Short\s*Answer\s*Type|Long\s*Answer\s*Type|উত্তরমালা)\s*$/i.test(text)
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

// ─── 6. CONFIDENCE SCORER ────────────────────────────────────────────────────
/**
 * Compute a composite confidence score from OCR and parser signals.
 */
function computeConfidenceScore(ocrConfidence, parserConfidence, layoutConfidence, sectionConfidence, segmentText, parsedBlock) {
  const ocr    = ocrConfidence    != null ? ocrConfidence    : 0.80;
  const parser = parserConfidence != null ? parserConfidence : 0.70;
  const layout = layoutConfidence != null ? layoutConfidence : 0.80;
  const sect   = sectionConfidence != null ? sectionConfidence : 0.80;

  // Structural confidence based on validation warning deduction
  const questionText = (segmentText || parsedBlock.question || '').trim();
  let structuralConfidence = 1.0;

  // Deductions
  if (questionText.length < 20) structuralConfidence -= 0.15;
  if (questionText.length < 10) structuralConfidence -= 0.20;

  const format = (parsedBlock.format || '').toLowerCase();
  const options = parsedBlock.options || [];
  if (['mcq', 'line-based', 'inline-mcq', 'structured'].includes(format) && options.length > 0) {
    const filledOptions = options.filter(o => o.text && o.text.trim().length > 0).length;
    if (filledOptions < 4) structuralConfidence -= 0.15;
    if (filledOptions < 2) structuralConfidence -= 0.35;
  }

  structuralConfidence = Math.max(0, structuralConfidence);

  // Weighted composite score
  const composite = (ocr * 0.3) + (parser * 0.25) + (layout * 0.15) + (sect * 0.1) + (structuralConfidence * 0.2);

  return {
    ocrConfidence:        ocr,
    parserConfidence:     parser,
    layoutConfidence:     layout,
    sectionConfidence:    sect,
    structuralConfidence,
    composite:            Math.max(0, Math.min(1, composite)),
    rating: composite >= 0.80 ? 'high' : composite >= 0.55 ? 'medium' : 'low',
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
        rawText: rawText || '', latex: rawLatex || '', parsedQuestions: [],
        confidence: confidence ?? 1.0, qualityRating: 'high', isValid: false,
        pageType: 'ANSWER_KEY_PAGE',
        detectionQuality: { source: 'classifier', multipleDetected: false, questionCount: 0 }
      };
    }

    const isTheoryPage = pageClassification.pageType === 'THEORY_PAGE';
    if (isTheoryPage) {
      console.log('[OCRPipeline] THEORY_PAGE detected. Blocking all content.');
      return {
        rawText: rawText || '', latex: rawLatex || '', parsedQuestions: [],
        confidence: confidence ?? 1.0, qualityRating: 'high', isValid: false,
        pageType: 'THEORY_PAGE',
        detectionQuality: { source: 'classifier', multipleDetected: false, questionCount: 0 }
      };
    }

    // ── Layer 6: OCR Recovery (low confidence / empty) ────────────────────
    if (OCRRecoveryEngine.needsRecovery({ rawText, latex: rawLatex, confidence })) {
      console.warn('[OCRPipeline] Low confidence OCR output, engaging recovery engine.');
      const fallbackItem = OCRRecoveryEngine.generateFallbackQuestion(rawText || 'Low confidence OCR output', filename);
      return {
        rawText: rawText || '', latex: rawLatex || '', parsedQuestions: [fallbackItem],
        confidence: confidence ?? 0.0, qualityRating: 'low', isValid: false,
        pageType: pageClassification.pageType,
        detectionQuality: { source: 'recovery', multipleDetected: false, questionCount: 1 }
      };
    }

    // ── Layer 7: Text normalization & LaTeX sanitization ──────────────────
    const normalizedText = OCRNormalizer.normalizeText(layoutText);
    const sanitizedLatex = LatexSanitizer.sanitize(layoutText, confidence);

    // ── Layer 8: Section Extraction (BEFORE segmentation) ─────────────────
    // We extract sections from the best text source first, then segment
    // each section independently to avoid cross-section number deduplication.
    const latexSections = PageClassificationEngine.extractSections(sanitizedLatex);
    const textSections  = PageClassificationEngine.extractSections(normalizedText);

    // Choose the source with more (or more diverse) sections
    const useSections = latexSections.length >= textSections.length ? latexSections : textSections;
    const useText     = latexSections.length >= textSections.length ? sanitizedLatex  : normalizedText;
    let   sourceUsed  = latexSections.length >= textSections.length ? 'latex'         : 'rawText';

    console.log(`[OCRPipeline] Sections detected: ${useSections.length}`, useSections.map(s => `"${s.title}" → ${s.parserType}`));

    // ── Layer 9: Build section text slices ────────────────────────────────
    // For each section, extract the text slice that belongs to it.
    // This ensures QuestionSegmenter sees ONLY one section at a time.
    const sectionSlices = useSections.map((sec, i) => {
      const nextSec  = useSections[i + 1];
      const start    = sec.startIndex;
      const end      = nextSec ? nextSec.startIndex : useText.length;
      const sliceRaw = useText.substring(start, end);

      // Remove the section heading line itself from the slice (to avoid header contamination) unless it is Default
      const sliceClean = sec.title === 'Default' ? sliceRaw.trim() : sliceRaw.replace(/^[^\n]*\n/, '').trim();

      return {
        title:      sec.title,
        parserType: sec.parserType,
        text:       sliceClean,
      };
    });

    // ── Layer 10: Per-section segmentation and routing ────────────────────
    const parsedQuestions = [];
    let   globalOrder     = 0;

    for (const section of sectionSlices) {

      // Block answer-key and theory sections entirely
      if (section.parserType === PARSER_TYPES.ANSWER_KEY || section.parserType === PARSER_TYPES.THEORY) {
        console.log(`[OCRPipeline] Skipping ignored section: "${section.title}" (${section.parserType})`);
        continue;
      }

      if (!section.text.trim()) continue;

      // Segment this section independently (fresh seenNumbers per section)
      const sectionSeenNumbers = new Set();
      let sectionSegments = QuestionSegmenter.segment(section.text);

      // Fallback: if no segments found, try whole section as one segment
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

        // Determine effective parser type — block-level may override section
        const blockClass = PageClassificationEngine.classifyBlock(seg.text, section.parserType);

        // ANSWER_KEY override at block level — skip individual blocks too
        if (blockClass.parserType === PARSER_TYPES.ANSWER_KEY) {
          console.log(`[OCRPipeline] Block-level answer key detected — skipping.`);
          continue;
        }

        const effectiveParserType = blockClass.parserType;

        console.log(`[OCRPipeline] [${section.title}] Segment #${idx + 1} (Q${seg.number}): parser=${effectiveParserType}, blockConf=${blockClass.confidence.toFixed(2)}`);

        // ── ROUTE TO PARSER ───────────────────────────────────────────────
        const parsedBlock = routeToParser(seg.text, effectiveParserType, confidence);

        // ── PRE-FILTER ────────────────────────────────────────────────────
        const questionNum = seg.number || String(idx + 1);
        const filter = preFilterSegment(parsedBlock.question, questionNum, sectionSeenNumbers);
        if (filter.skip) {
          console.log(`[OCRPipeline] Pre-filter rejected segment: ${filter.reason}`);
          continue;
        }

        // ── SANITIZE ──────────────────────────────────────────────────────
        const sanitizedQuestion = LatexSanitizer.sanitize(parsedBlock.question, confidence);
        const sanitizedOptions  = (parsedBlock.options || []).map(o => ({
          label: o.label,
          text:  LatexSanitizer.sanitize(o.text, confidence),
        }));

        // ── CONFIDENCE SCORING ────────────────────────────────────────────
        const confScore = computeConfidenceScore(
          confidence,
          parsedBlock.parserConfidence,
          pageClassification.confidence,
          section.confidence,
          seg.text,
          parsedBlock
        );

        // ── BUILD ENRICHED OBJECT ─────────────────────────────────────────
        globalOrder++;
        const enrichedQuestion = {
          question:        sanitizedQuestion,
          options:         sanitizedOptions,
          columnA:         parsedBlock.columnA || [],
          columnB:         parsedBlock.columnB || [],
          matchingChoices: parsedBlock.matchingChoices || [],
          blanks:          parsedBlock.blanks || [],
          blankCount:      parsedBlock.blankCount || 0,
          format:          parsedBlock.format || 'descriptive',
          questionNumber:  questionNum,
          rawChunk:        seg.text,
          ocrConfidence:   confidence,
          detectionOrder:  globalOrder,
          verified:        false,
          confidenceScores: confScore,
          rawOcrData: {
            sourceUsed,
            rawText,
            rawLatex,
            sanitizedLatex,
            confidence,
            chunkText:    seg.text,
            preprocessing: preprocessInfo ? preprocessInfo.diagnostics : null,
            preprocessingQuality: preprocessInfo ? preprocessInfo.qualityRating : null,
            layout: layoutMetadata,
            diagnostics: {
              rawOcr:              seg.text,
              normalizedOcr:       parsedBlock.question,
              parserModifications: parsedBlock.format,
              confidenceScore:     confidence,
              pageType:            pageClassification.pageType,
              sectionDetected:     section.title,
              parserType:          effectiveParserType,
              blockClassification: blockClass,
              answerPageDetected:  isAnsKey,
              tableDetected:       effectiveParserType === PARSER_TYPES.TABLE,
              fillDetected:        effectiveParserType === PARSER_TYPES.FILL,
            },
          },
        };

        // ── STRUCTURAL VALIDATION ──────────────────────────────────────────
        const validationResult = QuestionValidator.validate(enrichedQuestion);
        enrichedQuestion.validation = validationResult;

        if (!validationResult.isValid) {
          console.log(`[OCRPipeline] Validation FAILED for Q${questionNum}:`, validationResult.errors);
          if (confScore.composite < 0.50) {
            enrichedQuestion.quarantined = true;
            enrichedQuestion.quarantineReasons = validationResult.errors;
          }
          continue;
        }

        if (validationResult.warnings.length > 0) {
          console.warn(`[OCRPipeline] Warnings for Q${questionNum}:`, validationResult.warnings);
        }

        // ── PREVIEW ────────────────────────────────────────────────────────
        const previewData = PreviewRenderer.prepareQuestionPreview({
          questionText:   enrichedQuestion.question,
          options:        enrichedQuestion.options,
          questionNumber: enrichedQuestion.questionNumber,
          detectionOrder: enrichedQuestion.detectionOrder,
        });
        if (previewData) enrichedQuestion.preview = previewData;

        sectionSeenNumbers.add(questionNum);
        parsedQuestions.push(enrichedQuestion);
        } catch (segmentErr) {
          console.error(`[OCRPipeline] Error processing question segment #${idx + 1} in section "${section.title}":`, segmentErr);
        }
      }
    }

    // ── Layer 11: Pipeline-level quality validation ───────────────────────
    const pipelineValidation = OCRResultValidator.validate(rawText, sanitizedLatex, confidence);

    console.log('[OCRPipeline] Complete:', {
      questionsDetected: parsedQuestions.length,
      sourceUsed,
      pageType: pageClassification.pageType,
      sections: useSections.length,
      confidence: pipelineValidation.confidence,
      qualityRating: pipelineValidation.rating,
    });

    return {
      rawText:      rawText || '',
      latex:        sanitizedLatex,
      parsedQuestions,
      confidence:   pipelineValidation.confidence,
      qualityRating: pipelineValidation.rating,
      isValid:      pipelineValidation.isValid,
      pageType:     pageClassification.pageType,
      sections:     useSections.map(s => ({ title: s.title, parserType: s.parserType })),
      detectionQuality: {
        source:            sourceUsed,
        multipleDetected:  parsedQuestions.length > 1,
        questionCount:     parsedQuestions.length,
        pageClassification: pageClassification,
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
