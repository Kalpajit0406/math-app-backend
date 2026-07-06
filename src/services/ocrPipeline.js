/**
 * OCRPipeline — Production-Grade Document Understanding Pipeline (v3)
 *
 * ══════════════════════════════════════════════════════════════════════════
 * STRICT PIPELINE CONTRACT:
 *
 *   OCR → Layout Analysis → Column Detection → Question Boundary Detection
 *   → Question Cropping → MCQ Parser → Validation → Database
 *
 * CRITICAL INVARIANTS:
 *   1. The parser MUST NEVER treat an entire page as a single question.
 *   2. If pageType=MCQ, ocrLength>2000, and questionCount<2 → FAIL, not recover.
 *   3. The recovery engine MUST NEVER save to the database.
 *      It only produces a ManualReviewArtifact.
 *   4. No question reaches MongoDB without passing structural validation:
 *      - Valid questionText (non-empty, non-placeholder, non-noise)
 *      - Valid 4 options for MCQ (each non-empty)
 *      - Detected answer format
 *      - Confidence above threshold
 *   5. Every pipeline decision is logged verbosely for diagnostics.
 *
 * PHASES:
 *   Phase 1  — Page Layout Analysis (columns, regions, strip noise)
 *   Phase 2  — Question Boundary Detection + Segmentation
 *   Phase 3  — Text Normalization
 *   Phase 4  — Noise Removal + Metadata Extraction
 *   Phase 5  — MCQ Option Extraction
 *   Phase 6  — Answer Extraction
 *   Phase 7  — LaTeX Normalization
 *   Phase 8  — Diagram Detection
 *   Phase 9  — Structural Validation Gate
 *   Phase 10 — Confidence Scoring + Routing
 *   Phase 11 — Structured Output (schema-compliant)
 * ══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const { UploadHandler }        = require('./uploadHandler');
const { ImagePreprocessor }    = require('./imagePreprocessor');
const { OCRProviderAdapter }   = require('./ocrProviderAdapter');
const { PageLayoutAnalyzer }   = require('./pageLayoutAnalyzer');
const { OCRNormalizer }        = require('./ocrNormalizer');
const { NoiseRemover }         = require('./noiseRemover');
const { QuestionSegmenter }    = require('./questionSegmenter');
const { MCQOptionParser }      = require('./mcqOptionParser');
const { LatexNormalizer, LatexSanitizer } = require('./latexSanitizer');
const { AnswerExtractor }      = require('./answerExtractor');
const { DiagramDetector }      = require('./diagramDetector');
const { ConfidenceScorer }     = require('./confidenceScorer');
const { QuestionValidator }    = require('./questionValidator');
const { OCRRecoveryEngine }    = require('./ocrRecoveryEngine');
const { PageClassificationEngine, PARSER_TYPES } = require('./pageClassificationEngine');
const { FillInBlankParser }    = require('./fillInBlankParser');
const { ColumnMatchingParser } = require('./columnMatchingParser');
const { PreviewRenderer }      = require('./previewRenderer');

// Keep backward-compat exports from old pipeline
const { QuestionQueueManager } = require('./ocrQueueService');

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

// If MCQ page + text > this length + fewer than MIN_QUESTIONS_EXPECTED detected → FAIL (not recover)
const MCQ_MAX_TEXT_FOR_SINGLE_QUESTION = 2000;
const MIN_QUESTIONS_ON_DENSE_MCQ_PAGE  = 2;

// ─── VERBOSE DIAGNOSTIC LOGGER ────────────────────────────────────────────────
function diag(phase, msg, data = null) {
  const base = `[OCRPipeline:Phase${phase}] ${msg}`;
  if (data !== null) {
    console.log(base, typeof data === 'object' ? JSON.stringify(data) : data);
  } else {
    console.log(base);
  }
}

// ─── LANGUAGE DETECTION ───────────────────────────────────────────────────────
function detectLanguage(text) {
  if (!text) return 'English';
  const bengaliChars = (text.match(/[\u0980-\u09FF]/g) || []).length;
  const latinChars   = (text.match(/[a-zA-Z]/g) || []).length;
  if (bengaliChars > latinChars * 1.5) return 'Bengali';
  if (bengaliChars > 0 && latinChars > 0) return 'Both';
  return 'English';
}

// ─── TAGS EXTRACTOR ───────────────────────────────────────────────────────────
const TAG_PATTERNS = [
  { tags: ['algebra', 'equation'],     re: /\b(?:equation|algebraic|polynomial|quadratic|linear)\b/i },
  { tags: ['calculus', 'derivative'],  re: /\b(?:derivative|differential|integral|limit|calculus)\b/i },
  { tags: ['geometry', 'trigonometry'], re: /\b(?:triangle|circle|angle|sin|cos|tan|cot|sec|geometry|trigonometry)\b/i },
  { tags: ['probability', 'statistics'], re: /\b(?:probability|statistics|mean|median|mode|variance)\b/i },
  { tags: ['matrices', 'vectors'],     re: /\b(?:matrix|matrices|determinant|vector|tensor)\b/i },
  { tags: ['sets'],                    re: /\b(?:set|union|intersection|subset|complement|venn)\b/i },
  { tags: ['complex-numbers'],         re: /\b(?:complex|imaginary|real part|argument|modulus)\b/i },
  { tags: ['number-theory'],           re: /\b(?:prime|factor|divisibility|hcf|lcm|number theory)\b/i },
  { tags: ['coordinate-geometry'],     re: /\b(?:coordinate|abscissa|ordinate|locus|parabola|ellipse|hyperbola)\b/i },
];

function extractTags(questionText) {
  const tags = [];
  for (const { tags: t, re } of TAG_PATTERNS) {
    if (re.test(questionText)) tags.push(...t);
  }
  return [...new Set(tags)];
}

// ─── ANSWER KEY PAGE PARSER ───────────────────────────────────────────────────
function parseAnswerKeyText(text) {
  const map     = AnswerExtractor.parseAnswerKeyPage(text);
  const answers = [];
  for (const [questionNumber, correctAnswer] of map.entries()) {
    answers.push({ questionNumber, correctAnswer });
  }
  return answers;
}

// ─── MCQ PAGE INTEGRITY CHECK ─────────────────────────────────────────────────
/**
 * Enforces the strict rule:
 *   If pageType === MCQ_PAGE && ocrLength > 2000 && questionCount < 2 → FAIL
 *
 * Returns: { shouldFail: boolean, reason: string }
 */
function checkMCQPageIntegrity({ pageType, ocrTextLength, questionCount, segmentDiagnostics }) {
  const isMCQPage = pageType === 'MCQ_PAGE' || pageType === 'MIXED_PAGE';

  if (
    isMCQPage &&
    ocrTextLength > MCQ_MAX_TEXT_FOR_SINGLE_QUESTION &&
    questionCount < MIN_QUESTIONS_ON_DENSE_MCQ_PAGE
  ) {
    return {
      shouldFail: true,
      reason: [
        `MCQ page with ${ocrTextLength} chars produced only ${questionCount} question(s).`,
        `Expected ≥${MIN_QUESTIONS_ON_DENSE_MCQ_PAGE} on a dense MCQ page.`,
        `Boundary detection: ${JSON.stringify(segmentDiagnostics)}`,
        'Parser FAILED VALIDATION — routing to manual review.',
      ].join(' '),
    };
  }

  return { shouldFail: false, reason: null };
}

// ─── FORMAT ROUTER ────────────────────────────────────────────────────────────
function routeSegmentToParser(segmentText, parserType, ocrConf) {
  switch (parserType) {
    case PARSER_TYPES.TABLE: {
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
        parserConfidence: result.parserConfidence || 0.75,
      };
    }

    case PARSER_TYPES.FILL: {
      const result = FillInBlankParser.parse(segmentText);
      return {
        question:        result.question,
        options:         [],
        columnA:         [],
        columnB:         [],
        matchingChoices: [],
        blanks:          result.blanks || [],
        blankCount:      result.blankCount || 0,
        format:          'fill_in_blank',
        parserType:      PARSER_TYPES.FILL,
        parserConfidence: result.parserConfidence || 0.80,
      };
    }

    case PARSER_TYPES.MCQ:
    default: {
      const parsed = MCQOptionParser.parse(segmentText.trim());
      if (parsed) {
        return {
          question:        parsed.question,
          options:         parsed.options,
          columnA:         [],
          columnB:         [],
          matchingChoices: [],
          blanks:          [],
          blankCount:      0,
          format:          parsed.format || 'mcq',
          parserType:      PARSER_TYPES.MCQ,
          parserConfidence: parsed.isComplete ? 0.90 : parsed.filledCount >= 2 ? 0.70 : 0.40,
          optionsMeta: {
            filledCount:   parsed.filledCount,
            isComplete:    parsed.isComplete,
            hasDuplicates: parsed.hasDuplicates,
          },
        };
      }

      // MCQ parser found no options — mark as INCOMPLETE (not descriptive)
      // This will fail structural validation and route to QUARANTINE, not DB
      return {
        question:        segmentText.trim(),
        options:         [
          { label: 'A', text: '' },
          { label: 'B', text: '' },
          { label: 'C', text: '' },
          { label: 'D', text: '' },
        ],
        columnA: [], columnB: [], matchingChoices: [],
        blanks: [], blankCount: 0,
        format:          'mcq_incomplete',
        parserType:      PARSER_TYPES.MCQ,
        parserConfidence: 0.15,
        optionsMeta: { filledCount: 0, isComplete: false, hasDuplicates: false },
      };
    }
  }
}

// ─── STRUCTURAL VALIDATION GATE ───────────────────────────────────────────────
/**
 * Phase 9 strict gate: a question must pass ALL of these to be accepted.
 * Failures are routed to QUARANTINE, not the database.
 *
 * Returns { pass: boolean, reasons: string[] }
 */
function structuralValidationGate(parsedBlock, ocrConf) {
  const reasons = [];

  const qText = (parsedBlock.question || '').trim();

  // 1. Non-empty question
  if (!qText || qText.length < 5) {
    reasons.push(`EMPTY_QUESTION: question text is "${qText.slice(0, 30)}"`);
  }

  // 2. Question must not exceed page-length (single-segment full-page detection)
  if (qText.length > MCQ_MAX_TEXT_FOR_SINGLE_QUESTION * 2) {
    reasons.push(`QUESTION_TOO_LONG: ${qText.length} chars — likely entire page text in one segment`);
  }

  // 3. MCQ: must have exactly 4 options, each non-empty
  const format  = parsedBlock.format || '';
  const options = parsedBlock.options || [];
  const isMCQ   = !['fill_in_blank', 'column_matching', 'descriptive'].includes(format);

  if (isMCQ || format === 'mcq_incomplete') {
    const filled = options.filter(o => (o.text || '').trim().length > 0);
    if (filled.length < 4) {
      reasons.push(`MISSING_OPTIONS: only ${filled.length}/4 MCQ options have text`);
    }

    // Duplicate options
    const texts = filled.map(o => o.text.trim().toLowerCase());
    const unique = new Set(texts);
    if (unique.size < texts.length) {
      reasons.push('DUPLICATE_OPTIONS: two or more options have identical text');
    }
  }

  // 4. OCR confidence
  if (ocrConf < 0.30) {
    reasons.push(`LOW_CONFIDENCE: OCR confidence ${(ocrConf * 100).toFixed(0)}% < 30% threshold`);
  }

  return { pass: reasons.length === 0, reasons };
}

// ─── STRUCTURED OUTPUT BUILDER ────────────────────────────────────────────────
function buildStructuredQuestion({
  parsedBlock,
  questionNumber,
  rawChunk,
  sectionTitle,
  ocrConfidence,
  preprocessInfo,
  pageType,
  effectiveParserType,
  layoutMetadata,
  extractedMeta = {},
  diagramInfo   = {},
  answerData    = {},
  globalOrder   = 0,
}) {
  const qText   = (parsedBlock.question || '').trim();
  const options = parsedBlock.options || [];
  const language = detectLanguage(qText + ' ' + options.map(o => o.text).join(' '));
  const tags     = extractTags(qText);

  // Phase 10: Confidence scoring
  const confScore = ConfidenceScorer.compute({
    ocrConfidence,
    questionText:        qText,
    options,
    correctOption:       answerData.correctOption || null,
    questionNumber,
    hasDuplicateOptions: parsedBlock.optionsMeta?.hasDuplicates || false,
  });

  // Phase 9: Validation
  const validationResult = QuestionValidator.validate({
    question:      qText,
    format:        parsedBlock.format,
    options,
    ocrConfidence,
    correctOption: answerData.correctOption,
    columnA:       parsedBlock.columnA,
    columnB:       parsedBlock.columnB,
  });

  // Routing decision
  const extractionState = ConfidenceScorer.routingDecision(confScore, validationResult.quarantineReasons);

  // Phase 11: Build clean structured output
  return {
    // ── Core Question Data ─────────────────────────────────────────────────
    questionText:   OCRNormalizer.cleanQuestionText(qText),
    options:        options.map(o => ({
      label: o.label,
      text:  LatexNormalizer.normalize(
               NoiseRemover.cleanQuestionText(o.text || ''),
               ocrConfidence
             ),
    })),
    correctOption:  answerData.correctOption || null,
    correctAnswer:  answerData.correctAnswer || null,
    answerSource:   answerData.source || 'none',

    // ── Classification ─────────────────────────────────────────────────────
    format:         parsedBlock.format === 'mcq_incomplete' ? 'mcq' : (parsedBlock.format || 'mcq'),
    language,
    tags,

    // ── Metadata (extracted from noise, not invented) ─────────────────────
    chapter:        extractedMeta.chapter      || null,
    examBoard:      extractedMeta.examBoard    || null,
    examYear:       extractedMeta.examYear     || null,
    sourceSchool:   extractedMeta.sourceSchool || null,
    difficulty:     extractedMeta.difficulty   || null,

    // ── Diagram Info ────────────────────────────────────────────────────────
    diagram: {
      present:     diagramInfo.hasDiagram || false,
      type:        diagramInfo.diagramType || null,
      boundingBox: diagramInfo.boundingBox || null,
    },

    // ── Structured Extras ──────────────────────────────────────────────────
    columnA:         parsedBlock.columnA        || [],
    columnB:         parsedBlock.columnB        || [],
    matchingChoices: parsedBlock.matchingChoices || [],
    blanks:          parsedBlock.blanks         || [],
    blankCount:      parsedBlock.blankCount     || 0,

    // ── Confidence ─────────────────────────────────────────────────────────
    confidence: {
      questionConfidence:  confScore.questionConfidence,
      optionsConfidence:   confScore.optionsConfidence,
      answerConfidence:    confScore.answerConfidence,
      latexConfidence:     confScore.latexConfidence,
      overallConfidence:   confScore.overallConfidence,
      ocrConfidence:       confScore.ocrConfidence,
      rating:              confScore.rating,
      breakdown:           confScore.breakdown,
    },

    // ── Extraction State ───────────────────────────────────────────────────
    extractionState,
    quarantined:       extractionState === 'QUARANTINED',
    quarantineReasons: validationResult.quarantineReasons,
    validationErrors:  validationResult.errors,
    validationWarnings: validationResult.warnings,
    verified:          false,

    // ── Internal / Debug Data ──────────────────────────────────────────────
    questionNumber,
    detectionOrder:  globalOrder,
    sectionTitle,
    rawOcrData: {
      rawChunk,
      ocrConfidence,
      pageType,
      effectiveParserType,
      layoutMetadata,
      preprocessing: preprocessInfo ? preprocessInfo.diagnostics : null,
    },
  };
}

// ─── MAIN PIPELINE CLASS ──────────────────────────────────────────────────────

class OCRPipeline {

  /**
   * Full pipeline entry point for an image buffer.
   */
  static async runFromBuffer(buffer, mimetype, filename) {

    // ── Phase 0: Upload Validation ─────────────────────────────────────────
    UploadHandler.validate({ buffer, mimetype, size: buffer.length });

    // ── Phase 0.5: Image Preprocessing ────────────────────────────────────
    let preprocessInfo = null;
    let workingBuffer  = buffer;
    try {
      preprocessInfo = await ImagePreprocessor.preprocessBuffer(buffer);
      workingBuffer  = preprocessInfo.buffer;
    } catch (err) {
      console.warn('[OCRPipeline] Preprocessing failed, using original buffer:', err.message);
    }

    // ── Phase 0.6: OCR Provider ────────────────────────────────────────────
    let ocrResult;
    try {
      ocrResult = await OCRProviderAdapter.processImage(workingBuffer, mimetype, filename);
    } catch (err) {
      console.error('[OCRPipeline] OCR provider failed:', err.message);
      // OCR itself failed — produce a manual review artifact, return empty questions
      const artifact = OCRRecoveryEngine.generateManualReviewArtifact({
        rawOcrText:  '',
        filename,
        failureReason: `OCR provider error: ${err.message}`,
        pageType:    'UNKNOWN_PAGE',
        ocrConfidence: 0,
      });
      return this._buildFinalResponse([], {
        rawText: '', latex: '',
        confidence: 0.0, qualityRating: 'low', isValid: false,
        pageType: 'UNKNOWN_PAGE', answerKeys: [],
        totalRejected: 0, sections: [],
        manualReviewArtifacts: [artifact],
      });
    }

    return this.runPipelineOnOCRResult(ocrResult, filename, preprocessInfo);
  }

  /**
   * Run the full pipeline on an already-fetched OCR result.
   * Useful for testing and PDF pipeline reuse.
   */
  static async runPipelineOnOCRResult(ocrResult, filename, preprocessInfo = null) {
    const { rawText, latex: rawLatex, confidence } = ocrResult;
    const ocrConf = confidence != null ? confidence : 1.0;

    // ── CRITICAL: Check if OCR output is empty or critically broken ────────
    if (OCRRecoveryEngine.needsRecovery({ rawText, latex: rawLatex, confidence })) {
      console.warn('[OCRPipeline] OCR output is empty or critically low confidence — routing to manual review only.');
      const artifact = OCRRecoveryEngine.generateManualReviewArtifact({
        rawOcrText:    rawText || rawLatex || '',
        filename,
        failureReason: 'OCR output empty or confidence < 15%',
        ocrConfidence: ocrConf,
        pageType:      'UNKNOWN_PAGE',
        questionCount: 0,
      });
      return this._buildFinalResponse([], {
        rawText, latex: rawLatex, confidence: ocrConf,
        qualityRating: 'low', isValid: false,
        pageType: 'UNKNOWN_PAGE', answerKeys: [],
        totalRejected: 0, sections: [],
        manualReviewArtifacts: [artifact],
      });
    }

    // ── PHASE 1: Page Layout Analysis ─────────────────────────────────────
    diag(1, 'Page layout analysis start');
    let layoutAnalysis;
    try {
      layoutAnalysis = PageLayoutAnalyzer.analyze(ocrResult);
    } catch (e) {
      console.warn('[OCRPipeline] Phase 1 failed, using text fallback:', e.message);
      layoutAnalysis = PageLayoutAnalyzer.analyze(rawLatex || rawText || '');
    }

    const columnLayout = layoutAnalysis.columnLayout  || '1-col';
    const columnCount  = layoutAnalysis.columnCount   || 1;
    const pageText     = layoutAnalysis.cleanText     || rawLatex || rawText || '';

    diag(1, `Layout complete`, {
      strategy:    layoutAnalysis.layoutMetadata?.strategy,
      columnCount,
      columnLayout,
      cleanLines:  layoutAnalysis.layoutMetadata?.cleanLineCount,
      stripped:    layoutAnalysis.layoutMetadata?.strippedCount,
      textLength:  pageText.length,
    });

    // ── Page Classification ────────────────────────────────────────────────
    const pageClass = PageClassificationEngine.classifyPage(pageText);
    diag(1, `Page classified: ${pageClass.pageType} (conf: ${pageClass.confidence.toFixed(2)})`);

    // ── Answer key pages — parse keys, yield no questions ─────────────────
    if (pageClass.pageType === 'ANSWER_KEY_PAGE') {
      diag(1, 'Answer key page — extracting keys, no questions');
      const answerKeys = parseAnswerKeyText(pageText);
      return this._buildFinalResponse([], {
        rawText, latex: rawLatex, confidence: ocrConf,
        qualityRating: 'high', isValid: true,
        pageType: 'ANSWER_KEY_PAGE', answerKeys,
        totalRejected: 0, sections: [],
      });
    }

    // ── Theory pages — block entirely ─────────────────────────────────────
    if (pageClass.pageType === 'THEORY_PAGE') {
      diag(1, 'Theory page — blocking content');
      return this._buildFinalResponse([], {
        rawText, latex: rawLatex, confidence: ocrConf,
        qualityRating: 'high', isValid: false,
        pageType: 'THEORY_PAGE', answerKeys: [],
        totalRejected: 0, sections: [],
      });
    }

    // ── PHASE 3: Text Normalization ────────────────────────────────────────
    diag(3, 'Text normalization');
    const normalizedText = OCRNormalizer.normalizeText(pageText);

    // ── PHASE 4: Noise Removal ─────────────────────────────────────────────
    diag(4, 'Noise removal');
    const { cleanText, extractedMeta } = NoiseRemover.clean(normalizedText);
    diag(4, 'Metadata extracted', extractedMeta);

    // ── PHASE 7: LaTeX Normalization (on full page text) ───────────────────
    diag(7, 'LaTeX normalization');
    const latexText = LatexNormalizer.normalize(cleanText, ocrConf);

    // ── PHASE 8: Diagram Detection (page-level) ────────────────────────────
    diag(8, 'Diagram detection');
    const pageDiagramInfo = DiagramDetector.detect(layoutAnalysis, cleanText);

    // ── Section extraction ─────────────────────────────────────────────────
    const sections = PageClassificationEngine.extractSections(latexText);
    diag(2, `Sections detected: ${sections.length}`, sections.map(s => `"${s.title}"`));

    // ── Build section text slices ──────────────────────────────────────────
    const sectionSlices = sections.map((sec, i) => {
      const nextSec   = sections[i + 1];
      const start     = sec.startIndex;
      const end       = nextSec ? nextSec.startIndex : latexText.length;
      const sliceRaw  = latexText.slice(start, end);
      const sliceText = sec.title === 'Default' ? sliceRaw.trim() : sliceRaw.replace(/^[^\n]*\n/, '').trim();
      return {
        title:      sec.title,
        parserType: sec.parserType,
        text:       sliceText,
        confidence: sec.confidence,
      };
    });

    // ── Collect answer keys from answer-key sections ───────────────────────
    const answerKeys = [];
    for (const sec of sectionSlices) {
      if (sec.parserType === PARSER_TYPES.ANSWER_KEY) {
        const keys = parseAnswerKeyText(sec.text);
        answerKeys.push(...keys);
      }
    }
    const answerKeyMap = AnswerExtractor.parseAnswerKeyPage(
      answerKeys.map(k => `${k.questionNumber}. ${k.correctAnswer}`).join('\n')
    );

    // ── PHASE 2: Question segmentation + phases 5,6,7,9,10,11 ──────────────
    diag(2, 'Question segmentation and parsing start');

    const parsedQuestions      = [];
    const manualReviewArtifacts = [];
    const seenQNums            = new Set();
    let   globalOrder          = 0;
    let   totalRejected        = 0;

    for (const section of sectionSlices) {
      // Skip theory and answer key sections
      if (
        section.parserType === PARSER_TYPES.THEORY ||
        section.parserType === PARSER_TYPES.ANSWER_KEY
      ) {
        diag(2, `Skipping section: "${section.title}" (${section.parserType})`);
        continue;
      }
      if (!section.text.trim()) continue;

      // ── PRE-SEGMENTATION BOUNDARY DIAGNOSTIC ──────────────────────────
      const boundaryDiag = QuestionSegmenter.countDetectableBoundaries(section.text);
      diag(2, `Section "${section.title}" boundary scan`, {
        detectableCount: boundaryDiag.count,
        textLength:      section.text.length,
        columnLayout,
        boundaries:      boundaryDiag.boundaries.slice(0, 10),
      });

      // PHASE 2: Segment section into questions
      let segments = QuestionSegmenter.segment(section.text, {
        columnLayout,
        verbose: true,  // Full diagnostic logging
      });

      diag(2, `Section "${section.title}": ${segments.length} segment(s) produced`);

      // ── CRITICAL INTEGRITY CHECK ───────────────────────────────────────
      // If MCQ page + dense text + very few segments → FAIL, not fallback
      const integrityCheck = checkMCQPageIntegrity({
        pageType:           pageClass.pageType,
        ocrTextLength:      section.text.length,
        questionCount:      segments.length,
        segmentDiagnostics: boundaryDiag,
      });

      if (integrityCheck.shouldFail) {
        console.error(`[OCRPipeline:Phase2] MCQ PAGE INTEGRITY FAILURE: ${integrityCheck.reason}`);
        const artifact = OCRRecoveryEngine.generateManualReviewArtifact({
          rawOcrText:         section.text,
          filename,
          failureReason:      integrityCheck.reason,
          pageType:           pageClass.pageType,
          questionCount:      segments.length,
          ocrConfidence:      ocrConf,
          diagnostics: {
            columnLayout,
            columnCount,
            boundaryDiag,
            sectionTitle: section.title,
          },
          detectedBoundaries: boundaryDiag.boundaries.map(b => b.line),
        });
        manualReviewArtifacts.push(artifact);
        totalRejected++;
        continue;  // Do NOT fall through to single-segment processing
      }

      // ── FALLBACK: if truly no segments found but text is short, use as-is
      if (segments.length === 0 && section.text.trim().length > 10) {
        // Only do this for short text (likely a single question without a number)
        if (section.text.trim().length <= MCQ_MAX_TEXT_FOR_SINGLE_QUESTION) {
          segments = [{
            text:       section.text.trim(),
            number:     null,
            rawHeader:  '',
            startIndex: 0,
            endIndex:   section.text.length,
          }];
          diag(2, 'Using whole section as single unnumbered segment (short text)');
        } else {
          // Text is long but no boundaries found → manual review
          const artifact = OCRRecoveryEngine.generateManualReviewArtifact({
            rawOcrText:    section.text,
            filename,
            failureReason: `No question boundaries detected in ${section.text.length}-char text block`,
            pageType:      pageClass.pageType,
            questionCount: 0,
            ocrConfidence: ocrConf,
            diagnostics:   { boundaryDiag, columnLayout },
          });
          manualReviewArtifacts.push(artifact);
          totalRejected++;
          continue;
        }
      }

      // ── PROCESS EACH SEGMENT ──────────────────────────────────────────
      for (const seg of segments) {
        if (!seg.text || !seg.text.trim()) continue;

        try {
          const qNum = seg.number || null;

          // Skip duplicate question numbers
          if (qNum && seenQNums.has(qNum)) {
            diag(2, `Skipping duplicate Q#${qNum}`);
            totalRejected++;
            continue;
          }

          // PHASE 5: Parse options
          const parsedBlock = routeSegmentToParser(seg.text, section.parserType, ocrConf);

          diag(5, `Q#${qNum ?? '?'} parser result`, {
            format:      parsedBlock.format,
            filledOpts:  parsedBlock.optionsMeta?.filledCount ?? '?',
            isComplete:  parsedBlock.optionsMeta?.isComplete ?? '?',
            confidence:  parsedBlock.parserConfidence,
          });

          // ── PHASE 9 (EARLY): Structural gate before LaTeX normalization
          const structGate = structuralValidationGate(parsedBlock, ocrConf);
          if (!structGate.pass) {
            console.warn(`[OCRPipeline:Phase9] Q#${qNum ?? '?'} failed structural gate:`, structGate.reasons);
            totalRejected++;
            // Route to manual review artifact if MCQ page
            if (pageClass.pageType === 'MCQ_PAGE' || pageClass.pageType === 'MIXED_PAGE') {
              const artifact = OCRRecoveryEngine.generateManualReviewArtifact({
                rawOcrText:    seg.text,
                filename,
                failureReason: structGate.reasons.join('; '),
                pageType:      pageClass.pageType,
                questionCount: 1,
                ocrConfidence: ocrConf,
                diagnostics: {
                  questionNumber: qNum,
                  format: parsedBlock.format,
                  optionsMeta: parsedBlock.optionsMeta,
                  structureReasons: structGate.reasons,
                },
              });
              manualReviewArtifacts.push(artifact);
            }
            continue;
          }

          // PHASE 7: Normalize LaTeX in question and options
          parsedBlock.question = LatexNormalizer.normalize(parsedBlock.question, ocrConf);
          parsedBlock.options  = (parsedBlock.options || []).map(o => ({
            label: o.label,
            text:  LatexNormalizer.normalize(o.text || '', ocrConf),
          }));

          // PHASE 6: Extract answer badge
          const answerData = AnswerExtractor.extractFromSegment(
            seg.text,
            parsedBlock.options
          );

          // Apply from answer key map if not found inline
          if (!answerData.correctOption && qNum) {
            const num = parseInt(qNum, 10);
            if (answerKeyMap.has(num)) {
              answerData.correctOption = answerKeyMap.get(num);
              answerData.correctAnswer = AnswerExtractor._resolveAnswerText
                ? AnswerExtractor._resolveAnswerText(answerData.correctOption, parsedBlock.options)
                : answerData.correctOption;
              answerData.source = 'answer-key-page';
            }
          }

          diag(6, `Q#${qNum ?? '?'} answer`, {
            correctOption: answerData.correctOption,
            source: answerData.source,
          });

          // PHASE 8: Detect diagram in this question
          const qDiagramInfo = DiagramDetector.detectInQuestion(seg.text);

          // PHASE 4: Per-question noise removal
          const { cleanText: cleanQText } = NoiseRemover.clean(parsedBlock.question);
          parsedBlock.question = cleanQText;

          // Skip fragment questions
          if (!parsedBlock.question || parsedBlock.question.trim().length < 5) {
            diag(9, `Q#${qNum ?? '?'} REJECTED: question text too short`);
            totalRejected++;
            continue;
          }

          // PHASES 10, 11: Build validated structured output
          globalOrder++;
          const structured = buildStructuredQuestion({
            parsedBlock,
            questionNumber:      qNum,
            rawChunk:            seg.text,
            sectionTitle:        section.title,
            ocrConfidence:       ocrConf,
            preprocessInfo,
            pageType:            pageClass.pageType,
            effectiveParserType: section.parserType,
            layoutMetadata:      layoutAnalysis.layoutMetadata,
            extractedMeta,
            diagramInfo:         qDiagramInfo.hasDiagram
                                   ? { hasDiagram: true, diagramType: qDiagramInfo.diagramType, boundingBox: null }
                                   : { hasDiagram: pageDiagramInfo.diagramPresent, diagramType: pageDiagramInfo.diagrams?.[0]?.type || null, boundingBox: null },
            answerData,
            globalOrder,
          });

          diag(10, `Q#${qNum ?? '?'} routing: ${structured.extractionState}`, {
            overall:  structured.confidence.overallConfidence,
            quarantine: structured.quarantineReasons,
          });

          if (qNum) seenQNums.add(qNum);

          // Add preview data
          try {
            const preview = PreviewRenderer.prepareQuestionPreview({
              questionText:   structured.questionText,
              options:        structured.options,
              questionNumber: structured.questionNumber,
              detectionOrder: structured.detectionOrder,
            });
            if (preview) structured.preview = preview;
          } catch (_) { /* preview is non-critical */ }

          parsedQuestions.push(structured);

        } catch (segErr) {
          console.error('[OCRPipeline] Error processing segment:', segErr.message);
          totalRejected++;
        }
      }
    }

    // ── Apply page-level answer key to all questions ───────────────────────
    if (answerKeyMap.size > 0) {
      AnswerExtractor.applyAnswerKey(parsedQuestions, answerKeyMap);
    }

    diag(11, `Pipeline complete`, {
      extracted:         parsedQuestions.length,
      rejected:          totalRejected,
      manualReview:      manualReviewArtifacts.length,
      accepted:          parsedQuestions.filter(q => q.extractionState === 'ACCEPTED').length,
      preview:           parsedQuestions.filter(q => q.extractionState === 'PREVIEW').length,
      quarantined:       parsedQuestions.filter(q => q.extractionState === 'QUARANTINED').length,
    });

    return this._buildFinalResponse(parsedQuestions, {
      rawText,
      latex:        latexText,
      confidence:   ocrConf,
      qualityRating: ocrConf >= 0.85 ? 'high' : ocrConf >= 0.60 ? 'medium' : 'low',
      isValid:      parsedQuestions.length > 0,
      pageType:     pageClass.pageType,
      answerKeys,
      totalRejected,
      sections:     sectionSlices.map(s => ({ title: s.title, parserType: s.parserType })),
      layoutMetadata: layoutAnalysis.layoutMetadata,
      diagramDetection: pageDiagramInfo,
      manualReviewArtifacts,
    });
  }

  // ─── FINAL RESPONSE BUILDER ────────────────────────────────────────────────

  static _buildFinalResponse(parsedQuestions, meta) {
    return {
      rawText:          meta.rawText || '',
      latex:            meta.latex   || '',
      parsedQuestions,
      confidence:       meta.confidence    || 0,
      qualityRating:    meta.qualityRating || 'low',
      isValid:          meta.isValid       || false,
      pageType:         meta.pageType      || 'UNKNOWN_PAGE',
      answerKeys:       meta.answerKeys    || [],
      sections:         meta.sections      || [],
      totalRejected:    meta.totalRejected || 0,
      layoutMetadata:   meta.layoutMetadata || {},
      diagramDetection: meta.diagramDetection || { diagramPresent: false, diagrams: [] },
      // Manual review artifacts — NEVER insert these into MongoDB
      manualReviewArtifacts: meta.manualReviewArtifacts || [],
      detectionQuality: {
        source:           'redesigned-pipeline-v3',
        multipleDetected: parsedQuestions.length > 1,
        questionCount:    parsedQuestions.length,
        manualReviewCount: (meta.manualReviewArtifacts || []).length,
      },
    };
  }

  /**
   * Run from raw OCR text (for PDF pipeline or testing).
   */
  static async runParsing(ocrResult, filename) {
    const result = await this.runPipelineOnOCRResult(ocrResult, filename, null);
    if (result.pageType === 'THEORY_PAGE') {
      return { blocked: true, blockedResponse: result };
    }
    return {
      blocked:              false,
      parsedQuestions:      result.parsedQuestions,
      answerKeys:           result.answerKeys || [],
      pageType:             result.pageType,
      sections:             result.sections,
      totalRejected:        result.totalRejected,
      manualReviewArtifacts: result.manualReviewArtifacts || [],
    };
  }

  /**
   * Compatibility: runValidation called by legacy code.
   */
  static runValidation(parsedQuestions, ocrResult, pageType, sections, totalRejected, preprocessInfo, filename, answerKeys = []) {
    if (answerKeys.length > 0) {
      const keyMap = AnswerExtractor.parseAnswerKeyPage(
        answerKeys.map(k => `${k.questionNumber}. ${k.correctAnswer}`).join('\n')
      );
      AnswerExtractor.applyAnswerKey(parsedQuestions, keyMap);
    }
    return this._buildFinalResponse(parsedQuestions, {
      rawText:       ocrResult.rawText || '',
      latex:         ocrResult.latex   || '',
      confidence:    ocrResult.confidence || 0.80,
      qualityRating: 'high',
      isValid:       parsedQuestions.length > 0,
      pageType,
      answerKeys,
      totalRejected,
      sections,
    });
  }

  /**
   * Base64 / URL convenience wrapper (backward compat).
   */
  static async run(src) {
    let buffer, mimetype = 'image/jpeg', filename = 'image.jpg';

    if (src.startsWith('data:')) {
      const [meta, b64] = src.split(',');
      const mm = meta.match(/data:([^;]+);/);
      if (mm) mimetype = mm[1];
      buffer = Buffer.from(b64, 'base64');
    } else if (src.startsWith('http')) {
      const fetchModule = await import('node-fetch');
      const fetch = fetchModule.default;
      const resp  = await fetch(src);
      buffer = Buffer.from(await resp.arrayBuffer());
      const ct = resp.headers.get('content-type');
      if (ct) mimetype = ct.split(';')[0].trim();
    } else {
      buffer = Buffer.from(src, 'base64');
    }

    return this.runFromBuffer(buffer, mimetype, filename);
  }
}

// ─── BACKWARD-COMPAT MCQDetector ─────────────────────────────────────────────
class MCQDetector {
  static detectMultiple(text, rawText = null) {
    const segments = QuestionSegmenter.segment(text || rawText || '');
    return segments.map((seg, idx) => {
      const parsed = MCQOptionParser.parse(seg.text);
      return parsed
        ? {
            question:       LatexNormalizer.normalize(parsed.question),
            options:        parsed.options.map(o => ({ label: o.label, text: LatexNormalizer.normalize(o.text) })),
            format:         parsed.format,
            questionNumber: seg.number || String(idx + 1),
            rawChunk:       seg.text,
            ocrConfidence:  null,
          }
        : {
            question:       LatexNormalizer.normalize(seg.text),
            options:        [
              { label: 'A', text: '' },
              { label: 'B', text: '' },
              { label: 'C', text: '' },
              { label: 'D', text: '' },
            ],
            format:         'mcq_incomplete',
            questionNumber: seg.number || String(idx + 1),
            rawChunk:       seg.text,
            ocrConfidence:  null,
          };
    });
  }

  static detect(text) {
    return MCQOptionParser.parse((text || '').trim());
  }
}

// ─── BACKWARD-COMPAT OCRResultValidator ──────────────────────────────────────
class OCRResultValidator {
  static validate(rawText, latex, confidence) {
    const conf   = confidence != null ? confidence : 1.0;
    const rating = conf < 0.60 ? 'low' : conf < 0.85 ? 'medium' : 'high';
    const isValid = !!(rawText?.trim() || latex?.trim());
    return { confidence: conf, rating, isValid };
  }
}

module.exports = {
  OCRPipeline,
  MCQDetector,
  OCRResultValidator,
  QuestionSegmenter,
  LatexSanitizer,    // backward compat
  LatexNormalizer,
  isQuestionCandidate: (text) => !!(text && text.trim().length >= 5),
  parseAnswerKeys:     parseAnswerKeyText,
};
