/**
 * OCRPipeline — Production-Grade Document Understanding Pipeline
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  REDESIGNED PIPELINE (11 Phases)                            ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * PHASE 1  — Page Layout Analysis
 *            Detect columns, question regions, diagram regions
 *            Strip: headers, footers, page numbers, QR, borders, decorations
 *            NEVER OCR the page as one large text block
 *
 * PHASE 2  — Question Segmentation
 *            Split into independent question blocks
 *            Question number stored separately — NEVER inside questionText
 *
 * PHASE 3  — Text Normalization
 *            Fullwidth punctuation, Bengali danda, invisible Unicode,
 *            space collapse, duplicate space removal, math operators
 *
 * PHASE 4  — Noise Removal
 *            School names, exam years, board refs, publisher names,
 *            difficulty stars, answer key refs, QR refs, footers
 *            All stored as metadata, not deleted silently
 *
 * PHASE 5  — MCQ Option Extraction
 *            Exactly 4 labelled slots (A B C D)
 *            Handles Bengali, English, Roman, numeric labels
 *            Detects missing / duplicate options
 *
 * PHASE 6  — Answer Extraction
 *            Detects printed answer badge
 *            Stores correctOption AND correctAnswer
 *            Never infers from option order
 *
 * PHASE 7  — LaTeX Normalization
 *            Consistent $...$ / $$...$$ style
 *            Full Unicode → LaTeX symbol map
 *            Balance environments, fracs, matrices
 *
 * PHASE 8  — Diagram Detection
 *            Venn, geometry, graph, table, coordinate plane
 *            diagramPresent, diagramType, boundingBox
 *
 * PHASE 9  — Validation Gate
 *            Reject if: <4 options, no question, duplicates, OCR below threshold
 *            Send to PREVIEW if confidence 0.50–0.75
 *
 * PHASE 10 — Confidence Scoring
 *            5 independent confidence dimensions
 *            Routes to ACCEPTED / PREVIEW / QUARANTINED
 *
 * PHASE 11 — Structured Output
 *            Clean MathsWithSD schema — no OCR artefacts, no noise
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
// Extracts math topic tags from question text
const TAG_PATTERNS = [
  { tags: ['algebra', 'equation'],  re: /\b(?:equation|algebraic|polynomial|quadratic|linear)\b/i },
  { tags: ['calculus', 'derivative'], re: /\b(?:derivative|differential|integral|limit|calculus)\b/i },
  { tags: ['geometry', 'trigonometry'], re: /\b(?:triangle|circle|angle|sin|cos|tan|cot|sec|geometry|trigonometry)\b/i },
  { tags: ['probability', 'statistics'], re: /\b(?:probability|statistics|mean|median|mode|variance)\b/i },
  { tags: ['matrices', 'vectors'],   re: /\b(?:matrix|matrices|determinant|vector|tensor)\b/i },
  { tags: ['sets'],                  re: /\b(?:set|union|intersection|subset|complement|venn)\b/i },
  { tags: ['complex-numbers'],       re: /\b(?:complex|imaginary|real part|argument|modulus)\b/i },
  { tags: ['number-theory'],         re: /\b(?:prime|factor|divisibility|hcf|lcm|number theory)\b/i },
  { tags: ['coordinate-geometry'],   re: /\b(?:coordinate|abscissa|ordinate|locus|parabola|ellipse|hyperbola)\b/i },
];

function extractTags(questionText) {
  const tags = [];
  for (const { tags: t, re } of TAG_PATTERNS) {
    if (re.test(questionText)) tags.push(...t);
  }
  return [...new Set(tags)];
}

// ─── ANSWER KEY PAGE PARSER ───────────────────────────────────────────────────
// Kept from original pipeline for compatibility
function parseAnswerKeyText(text) {
  const map = AnswerExtractor.parseAnswerKeyPage(text);
  const answers = [];
  for (const [questionNumber, correctAnswer] of map.entries()) {
    answers.push({ questionNumber, correctAnswer });
  }
  return answers;
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
      // MCQ parser found nothing — return as descriptive (4 empty slots)
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
        format:          'descriptive',
        parserType:      PARSER_TYPES.MCQ,
        parserConfidence: 0.35,
        optionsMeta: { filledCount: 0, isComplete: false, hasDuplicates: false },
      };
    }
  }
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
  const qText     = (parsedBlock.question || '').trim();
  const options   = parsedBlock.options || [];
  const language  = detectLanguage(qText + ' ' + options.map(o => o.text).join(' '));
  const tags      = extractTags(qText);

  // Phase 10: Confidence scoring
  const confScore = ConfidenceScorer.compute({
    ocrConfidence:       ocrConfidence,
    questionText:        qText,
    options:             options,
    correctOption:       answerData.correctOption || null,
    questionNumber:      questionNumber,
    hasDuplicateOptions: parsedBlock.optionsMeta?.hasDuplicates || false,
  });

  // Phase 9: Validation
  const validationResult = QuestionValidator.validate({
    question:       qText,
    format:         parsedBlock.format,
    options:        options,
    ocrConfidence:  ocrConfidence,
    correctOption:  answerData.correctOption,
    columnA:        parsedBlock.columnA,
    columnB:        parsedBlock.columnB,
  });

  // Routing decision
  const extractionState = ConfidenceScorer.routingDecision(confScore, validationResult.quarantineReasons);

  // Phase 11: Build clean structured output
  return {
    // ── Core Question Data ─────────────────────────────────────────────────
    questionText:    OCRNormalizer.cleanQuestionText(qText),
    options:         options.map(o => ({
      label: o.label,
      text:  LatexNormalizer.normalize(
               NoiseRemover.cleanQuestionText(o.text || ''),
               ocrConfidence
             ),
    })),
    correctOption:   answerData.correctOption || null,
    correctAnswer:   answerData.correctAnswer || null,
    answerSource:    answerData.source || 'none',

    // ── Classification ─────────────────────────────────────────────────────
    format:          parsedBlock.format || 'mcq',
    language,
    tags,

    // ── Metadata (extracted from noise, not invented) ─────────────────────
    chapter:         extractedMeta.chapter      || null,
    examBoard:       extractedMeta.examBoard    || null,
    examYear:        extractedMeta.examYear     || null,
    sourceSchool:    extractedMeta.sourceSchool || null,
    difficulty:      extractedMeta.difficulty   || null,

    // ── Diagram Info ────────────────────────────────────────────────────────
    diagram: {
      present:      diagramInfo.hasDiagram || false,
      type:         diagramInfo.diagramType || null,
      boundingBox:  diagramInfo.boundingBox || null,
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
    quarantined:      extractionState === 'QUARANTINED',
    quarantineReasons: validationResult.quarantineReasons,
    validationErrors:  validationResult.errors,
    validationWarnings: validationResult.warnings,
    verified:          false,

    // ── Internal / Debug Data ──────────────────────────────────────────────
    questionNumber,
    detectionOrder: globalOrder,
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
      const fallback = OCRRecoveryEngine.generateFallbackQuestion(err, filename);
      return this._buildFinalResponse([], {
        rawText: '', latex: '',
        confidence: 0.0, qualityRating: 'low', isValid: false,
        pageType: 'UNKNOWN_PAGE', answerKeys: [],
        totalRejected: 0, sections: [],
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

    // ── PHASE 1: Page Layout Analysis ─────────────────────────────────────
    console.log('[OCRPipeline] Phase 1: Page layout analysis');
    let layoutAnalysis;
    try {
      layoutAnalysis = PageLayoutAnalyzer.analyze(ocrResult);
    } catch (e) {
      console.warn('[OCRPipeline] Phase 1 failed, using text fallback:', e.message);
      layoutAnalysis = PageLayoutAnalyzer.analyze(rawLatex || rawText || '');
    }

    const pageText = layoutAnalysis.cleanText || rawLatex || rawText || '';

    // ── Page Classification (for answer-key / theory blocking) ────────────
    const pageClass = PageClassificationEngine.classifyPage(pageText);
    console.log(`[OCRPipeline] Page classified as: ${pageClass.pageType} (conf: ${pageClass.confidence.toFixed(2)})`);

    // ── Answer key pages — parse keys, yield no questions ─────────────────
    if (pageClass.pageType === 'ANSWER_KEY_PAGE') {
      console.log('[OCRPipeline] Answer key page detected — extracting keys only.');
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
      console.log('[OCRPipeline] Theory page detected — blocking content.');
      return this._buildFinalResponse([], {
        rawText, latex: rawLatex, confidence: ocrConf,
        qualityRating: 'high', isValid: false,
        pageType: 'THEORY_PAGE', answerKeys: [],
        totalRejected: 0, sections: [],
      });
    }

    // ── Low confidence recovery ────────────────────────────────────────────
    if (OCRRecoveryEngine.needsRecovery({ rawText, latex: rawLatex, confidence })) {
      console.warn('[OCRPipeline] Low confidence OCR — recovery mode.');
      const fallback = OCRRecoveryEngine.generateFallbackQuestion(rawText || 'Low confidence', filename);
      return this._buildFinalResponse([fallback], {
        rawText, latex: rawLatex, confidence: ocrConf,
        qualityRating: 'low', isValid: false,
        pageType: pageClass.pageType, answerKeys: [],
        totalRejected: 0, sections: [],
      });
    }

    // ── PHASE 3: Text Normalization ────────────────────────────────────────
    console.log('[OCRPipeline] Phase 3: Text normalization');
    const normalizedText = OCRNormalizer.normalizeText(pageText);

    // ── PHASE 4: Noise Removal ─────────────────────────────────────────────
    console.log('[OCRPipeline] Phase 4: Noise removal');
    const { cleanText, extractedMeta } = NoiseRemover.clean(normalizedText);

    // ── PHASE 7: LaTeX Normalization (on full page text) ───────────────────
    console.log('[OCRPipeline] Phase 7: LaTeX normalization');
    const latexText = LatexNormalizer.normalize(cleanText, ocrConf);

    // ── PHASE 8: Diagram Detection (page-level) ────────────────────────────
    console.log('[OCRPipeline] Phase 8: Diagram detection');
    const pageDiagramInfo = DiagramDetector.detect(layoutAnalysis, cleanText);

    // ── Section extraction ─────────────────────────────────────────────────
    const sections = PageClassificationEngine.extractSections(latexText);
    console.log(`[OCRPipeline] Sections: ${sections.length}`, sections.map(s => `"${s.title}"`));

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

    // ── PHASE 2, 5, 6, 9, 10, 11: Per-section question processing ─────────
    console.log('[OCRPipeline] Phase 2/5/6/9/10/11: Question segmentation and parsing');
    const parsedQuestions = [];
    const seenQNums       = new Set();
    let   globalOrder     = 0;
    let   totalRejected   = 0;

    for (const section of sectionSlices) {
      // Skip theory and answer key sections
      if (section.parserType === PARSER_TYPES.THEORY ||
          section.parserType === PARSER_TYPES.ANSWER_KEY) {
        console.log(`[OCRPipeline] Skipping section: "${section.title}" (${section.parserType})`);
        continue;
      }
      if (!section.text.trim()) continue;

      // PHASE 2: Segment section into questions
      let segments = QuestionSegmenter.segment(section.text);
      if (segments.length === 0 && section.text.trim().length > 10) {
        segments = [{ text: section.text.trim(), number: null, rawHeader: '', startIndex: 0, endIndex: section.text.length }];
      }

      for (const seg of segments) {
        if (!seg.text || !seg.text.trim()) continue;

        try {
          const qNum = seg.number || null;

          // Skip duplicate question numbers
          if (qNum && seenQNums.has(qNum)) {
            console.log(`[OCRPipeline] Skipping duplicate question number: ${qNum}`);
            totalRejected++;
            continue;
          }

          // PHASE 5: Parse options
          const parsedBlock = routeSegmentToParser(seg.text, section.parserType, ocrConf);

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

          // PHASE 8: Detect diagram in this specific question
          const qDiagramInfo = DiagramDetector.detectInQuestion(seg.text);

          // PHASE 4: Per-question noise removal (inline metadata)
          const { cleanText: cleanQText } = NoiseRemover.clean(parsedBlock.question);
          parsedBlock.question = cleanQText;

          // Skip fragment questions
          if (!parsedBlock.question || parsedBlock.question.trim().length < 5) {
            totalRejected++;
            continue;
          }

          // PHASES 9, 10, 11: Build validated structured output
          globalOrder++;
          const structured = buildStructuredQuestion({
            parsedBlock,
            questionNumber:    qNum,
            rawChunk:          seg.text,
            sectionTitle:      section.title,
            ocrConfidence:     ocrConf,
            preprocessInfo,
            pageType:          pageClass.pageType,
            effectiveParserType: section.parserType,
            layoutMetadata:    layoutAnalysis.layoutMetadata,
            extractedMeta,
            diagramInfo:       qDiagramInfo.hasDiagram
                                 ? { hasDiagram: true, diagramType: qDiagramInfo.diagramType, boundingBox: null }
                                 : { hasDiagram: pageDiagramInfo.diagramPresent, diagramType: pageDiagramInfo.diagrams[0]?.type || null, boundingBox: null },
            answerData,
            globalOrder,
          });

          if (qNum) seenQNums.add(qNum);

          // Add preview data
          try {
            const preview = PreviewRenderer.prepareQuestionPreview({
              questionText:    structured.questionText,
              options:         structured.options,
              questionNumber:  structured.questionNumber,
              detectionOrder:  structured.detectionOrder,
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

    console.log(`[OCRPipeline] Complete. ${parsedQuestions.length} questions extracted, ${totalRejected} rejected.`);

    return this._buildFinalResponse(parsedQuestions, {
      rawText,
      latex:        latexText,
      confidence:   ocrConf,
      qualityRating: ocrConf >= 0.85 ? 'high' : ocrConf >= 0.60 ? 'medium' : 'low',
      isValid:      parsedQuestions.length > 0,
      pageType:     pageClass.pageType,
      answerKeys,
      totalRejected,
      sections: sectionSlices.map(s => ({ title: s.title, parserType: s.parserType })),
      layoutMetadata: layoutAnalysis.layoutMetadata,
      diagramDetection: pageDiagramInfo,
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
      detectionQuality: {
        source:            'redesigned-pipeline-v2',
        multipleDetected:  parsedQuestions.length > 1,
        questionCount:     parsedQuestions.length,
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
      blocked:         false,
      parsedQuestions: result.parsedQuestions,
      answerKeys:      result.answerKeys || [],
      pageType:        result.pageType,
      sections:        result.sections,
      totalRejected:   result.totalRejected,
    };
  }

  /**
   * Compatibility: runValidation called by legacy code.
   * In the redesigned pipeline, validation is embedded in runPipelineOnOCRResult.
   */
  static runValidation(parsedQuestions, ocrResult, pageType, sections, totalRejected, preprocessInfo, filename, answerKeys = []) {
    // Apply answer keys if any
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
// Many call sites use MCQDetector.detectMultiple() — keep it working
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
            format:         'descriptive',
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
    const conf = confidence != null ? confidence : 1.0;
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
