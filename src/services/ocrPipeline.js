const { UploadHandler } = require('./uploadHandler');
const { ImagePreprocessor } = require('./imagePreprocessor');
const { OCRProviderAdapter } = require('./ocrProviderAdapter');
const { OCRNormalizer } = require('./ocrNormalizer');
const { QuestionSegmenter } = require('./questionSegmenter');
const { MCQOptionParser } = require('./mcqOptionParser');
const { LatexSanitizer } = require('./latexSanitizer');
const { VerificationQueueManager } = require('./verificationQueueManager');
const { QuestionValidator } = require('./questionValidator');
const { PreviewRenderer } = require('./previewRenderer');
const { OCRRecoveryEngine } = require('./ocrRecoveryEngine');
const { ContentClassificationEngine } = require('./contentClassificationEngine');

// ─── 1. MCQ DETECTOR ───────────────────────────────────────────────────────────
class MCQDetector {
  /**
   * Split a block of text into segment components using the QuestionSegmenter.
   */
  static splitMultipleQuestions(text) {
    if (!text) return [];
    
    const segments = QuestionSegmenter.segment(text);
    return segments.map((seg, idx) => ({
      text: seg.text,
      number: seg.number || (idx + 1).toString(),
      numberPattern: seg.rawHeader || ''
    }));
  }

  /**
   * Main parsing method to detect and format MCQ options and questions.
   */
  static detect(text) {
    if (!text || typeof text !== 'string') return null;
    return MCQOptionParser.parse(text.trim());
  }

  /**
   * Detect multiple MCQ items from structured text.
   */
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
        console.log(`[MCQDetector] Segment for Q# ${chunk.number} parsed as descriptive/fallback.`);
        results.push({
          question: LatexSanitizer.sanitize(chunk.text),
          options: [
            {label: 'A', text: ''}, 
            {label: 'B', text: ''}, 
            {label: 'C', text: ''}, 
            {label: 'D', text: ''}
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

// ─── 2. IN-MEMORY QUEUE MANAGER (COMPATIBILITY FALLBACK) ────────────────────
class QuestionQueueManager {
  constructor() {
    this.queues = new Map(); // userId -> { items: [], createdAt, expiresAt }
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
      expiresAt: expiresAt,
      currentIndex: 0
    });
    return { sessionId, count: cappedQuestions.length, expiresAt };
  }

  getCurrentQuestion(sessionId) {
    const queue = this.queues.get(sessionId);
    if (!queue || this._isExpired(queue)) {
      this.queues.delete(sessionId);
      return null;
    }
    return queue.items[queue.currentIndex] || null;
  }

  getQueueItems(sessionId) {
    const queue = this.queues.get(sessionId);
    if (!queue || this._isExpired(queue)) {
      this.queues.delete(sessionId);
      return [];
    }
    return queue.items;
  }

  nextQuestion(sessionId) {
    const queue = this.queues.get(sessionId);
    if (!queue) return null;
    queue.currentIndex++;
    if (queue.currentIndex >= queue.items.length) {
      this.queues.delete(sessionId);
      return null;
    }
    return queue.items[queue.currentIndex];
  }

  prevQuestion(sessionId) {
    const queue = this.queues.get(sessionId);
    if (!queue) return null;
    if (queue.currentIndex > 0) {
      queue.currentIndex--;
    }
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
    if (queue.currentIndex >= queue.items.length && queue.currentIndex > 0) {
      queue.currentIndex--;
    }
    return true;
  }

  clearQueue(sessionId) {
    this.queues.delete(sessionId);
  }

  _isExpired(queue) {
    return Date.now() > queue.expiresAt;
  }

  cleanup() {
    const now = Date.now();
    for (const [sessionId, queue] of this.queues.entries()) {
      if (now > queue.expiresAt) {
        this.queues.delete(sessionId);
      }
    }
  }
}

// ─── 3. OCR RESULT VALIDATOR ──────────────────────────────────────────────────
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

// ─── 4. UNIFIED OCR PIPELINE ─────────────────────────────────────────────────
class OCRPipeline {
  /**
   * Run the modularized, coordinated OCR pipeline on an image buffer.
   * @param {Buffer} buffer   - Raw image buffer from multer memoryStorage
   * @param {string} mimetype - MIME type (e.g. 'image/jpeg')
   * @param {string} filename - Original filename
   */
  static async runFromBuffer(buffer, mimetype, filename) {
    // Layer 1: Upload validation
    UploadHandler.validate({ buffer, mimetype, size: buffer.length });

    // Layer 2: Image preprocessing
    let preprocessInfo = null;
    let workingBuffer = buffer;
    try {
      preprocessInfo = await ImagePreprocessor.preprocessBuffer(buffer);
      workingBuffer = preprocessInfo.buffer;
    } catch (err) {
      console.warn('[OCRPipeline] Image preprocessing failed, proceeding with original buffer:', err.message);
    }

    // Layer 3: OCR provider processing
    let ocrResult;
    try {
      ocrResult = await OCRProviderAdapter.processImage(workingBuffer, mimetype, filename);
    } catch (err) {
      // Layer 11: OCR Recovery on API Failure
      console.error('[OCRPipeline] OCR Provider Adapter failure, calling recovery engine:', err.message);
      const fallbackItem = OCRRecoveryEngine.generateFallbackQuestion(err, filename);
      return {
        rawText: '',
        latex: '',
        parsedQuestions: [fallbackItem],
        confidence: 0.0,
        qualityRating: 'low',
        isValid: false,
        detectionQuality: {
          source: 'recovery',
          multipleDetected: false,
          questionCount: 1
        }
      };
    }

    const { rawText, latex: rawLatex, confidence } = ocrResult;

    // Strict answer key page check at the very beginning of processing
    const isAnsKey = ContentClassificationEngine.isAnswerKeyPage(rawText) || ContentClassificationEngine.isAnswerKeyPage(rawLatex);
    if (isAnsKey) {
      console.log('[OCRPipeline] STRICT Answer Key Page Detected. Skipping parser.');
      return {
        rawText: rawText || '',
        latex: rawLatex || '',
        parsedQuestions: [],
        confidence: confidence ?? 1.0,
        qualityRating: 'high',
        isValid: false,
        pageType: 'ANSWER_KEY_PAGE',
        detectionQuality: {
          source: 'classifier',
          multipleDetected: false,
          questionCount: 0
        }
      };
    }

    // Check if recovery is needed due to low confidence or empty OCR response
    if (OCRRecoveryEngine.needsRecovery({ rawText, latex: rawLatex, confidence })) {
      console.warn('[OCRPipeline] Low confidence or empty output, engaging recovery engine.');
      const fallbackItem = OCRRecoveryEngine.generateFallbackQuestion(rawText || 'Low confidence OCR output', filename);
      return {
        rawText: rawText || '',
        latex: rawLatex || '',
        parsedQuestions: [fallbackItem],
        confidence: confidence ?? 0.0,
        qualityRating: 'low',
        isValid: false,
        detectionQuality: {
          source: 'recovery',
          multipleDetected: false,
          questionCount: 1
        }
      };
    }

    // Layer 4: OCR output text normalization
    const normalizedText = OCRNormalizer.normalizeText(rawText);

    // Layer 7: LaTeX sanitization (Passing OCR confidence to sanitization engine)
    const sanitizedLatex = LatexSanitizer.sanitize(rawLatex, confidence);

    // Layer 5: Question segmentation
    // Try segmenting on LaTeX first, fall back to normalized text if no questions detected
    let segments = QuestionSegmenter.segment(sanitizedLatex);
    let sourceUsed = 'latex';

    if (segments.length === 0 || (segments.length === 1 && !segments[0].number)) {
      const textSegments = QuestionSegmenter.segment(normalizedText);
      if (textSegments.length > 0) {
        segments = textSegments;
        sourceUsed = 'rawText';
      }
    }

    // Helper functions for Table and Fill detection
    const detectTableOrGrid = (text) => {
      if (!text) return false;
      const normalized = text.toLowerCase();
      if (normalized.includes('\\begin{matrix}') || normalized.includes('\\begin{pmatrix}') || normalized.includes('\\begin{bmatrix}') || normalized.includes('\\begin{array}')) {
        return true;
      }
      if (normalized.includes('\\begin{tabular}') || normalized.includes('\\end{tabular}')) {
        return true;
      }
      if (normalized.includes('column a') || normalized.includes('column b') || 
          normalized.includes('স্তম্ভ a') || normalized.includes('স্তম্ভ b') || 
          normalized.includes('স্তম্ভ-i') || normalized.includes('স্তম্ভ-ii') ||
          normalized.includes('match the column') || normalized.includes('स्तंभ')) {
        return true;
      }
      if (/\[[a-d1-4i-v]\]\s*-\s*\[[a-d1-4i-v]\]/i.test(text) || /\([a-d1-4i-v]\)\s*-\s*\(?[a-d1-4i-v]\)?/i.test(text)) {
        return true;
      }
      const pipeCount = (text.match(/\|/g) || []).length;
      if (pipeCount >= 4) return true;
      return false;
    };

    const detectFillInBlank = (text) => {
      if (!text) return false;
      const normalized = text.toLowerCase();
      if (normalized.includes('fill in the blank') || normalized.includes('শূন্যস্থান') || normalized.includes('रिक्त स्थान')) {
        return true;
      }
      if (text.includes('_____') || text.includes('....') || text.includes('. . . .')) {
        return true;
      }
      return false;
    };

    // Helper to extract section titles and map transition indices from the base text
    const extractSections = (text) => {
      const lines = text.split('\n');
      const sections = [];
      let currentSection = 'Default';
      let charIndex = 0;
      
      sections.push({
        title: 'Default',
        startIndex: 0,
        parserType: 'MCQ'
      });
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          const isTitle = ContentClassificationEngine.classifyLine(line) === 'SECTION_TITLE' ||
                          /^(?:Conventional Type|Multiple Choice Questions|Fill in the Blanks|Column Matching|Analytical Type|Short Answer Type|Long Answer Type|উত্তরমালা)\s*$/i.test(trimmed);
          if (isTitle) {
            currentSection = trimmed;
            let parserType = 'MCQ';
            const norm = trimmed.toLowerCase();
            if (norm.includes('column matching') || norm.includes('स्तंभ') || norm.includes('স্তম্ভ মেলাও') || norm.includes('match the column')) {
              parserType = 'TABLE';
            } else if (norm.includes('fill in the blank') || norm.includes('শূন্যস্থান') || norm.includes('रिक्त स्थान')) {
              parserType = 'FILL';
            }
            
            sections.push({
              title: currentSection,
              startIndex: charIndex,
              parserType: parserType
            });
          }
        }
        charIndex += line.length + 1;
      }
      return sections;
    };

    const baseText = sourceUsed === 'latex' ? sanitizedLatex : normalizedText;
    const sections = extractSections(baseText);
    const seenNumbers = new Set();
    let currentParserState = {
      sectionTitle: 'Default',
      parserType: 'MCQ'
    };

    const parsedQuestions = [];
    let origSearchIndex = 0;

    for (let idx = 0; idx < segments.length; idx++) {
      const seg = segments[idx];
      if (!seg.text || !seg.text.trim()) continue;

      // Locate segment offset in the original OCR text block
      let segmentIndex = baseText.indexOf(seg.text, origSearchIndex);
      if (segmentIndex === -1) {
        segmentIndex = baseText.indexOf(seg.text.substring(0, Math.min(20, seg.text.length)));
      }
      if (segmentIndex !== -1) {
        origSearchIndex = segmentIndex + seg.text.length;
      }

      // Map offset to the active section
      let activeSection = sections[0];
      for (const section of sections) {
        if (section.startIndex <= segmentIndex) {
          activeSection = section;
        }
      }

      // PART 7 — PARSER STATE RESET: Reset if section or parser type changed
      if (currentParserState.sectionTitle !== activeSection.title || currentParserState.parserType !== activeSection.parserType) {
        console.log(`[Parser State Reset] Transition from "${currentParserState.sectionTitle}" to "${activeSection.title}". Resetting seen numbers.`);
        seenNumbers.clear();
        currentParserState = {
          sectionTitle: activeSection.title,
          parserType: activeSection.parserType
        };
      }

      // Determine parser type for this specific block (Table, Fill, or MCQ)
      let segmentParserType = currentParserState.parserType;
      const isTable = detectTableOrGrid(seg.text);
      const isFill = detectFillInBlank(seg.text);

      if (isTable) {
        segmentParserType = 'TABLE';
      } else if (isFill) {
        segmentParserType = 'FILL';
      }

      // Route based on segment classification (preventing tables from entering MCQ parser)
      let parsedBlock;
      if (segmentParserType === 'TABLE') {
        parsedBlock = {
          question: seg.text,
          options: [{ label: 'A', text: '' }, { label: 'B', text: '' }, { label: 'C', text: '' }, { label: 'D', text: '' }],
          format: 'column_matching'
        };
      } else if (segmentParserType === 'FILL') {
        parsedBlock = {
          question: seg.text,
          options: [{ label: 'A', text: '' }, { label: 'B', text: '' }, { label: 'C', text: '' }, { label: 'D', text: '' }],
          format: 'fill_in_blank'
        };
      } else {
        parsedBlock = MCQDetector.detect(seg.text) || {
          question: seg.text,
          options: [{ label: 'A', text: '' }, { label: 'B', text: '' }, { label: 'C', text: '' }, { label: 'D', text: '' }],
          format: 'descriptive'
        };
      }

      // PART 9 — STRUCTURAL VALIDATION
      const questionText = parsedBlock.question.trim();
      const questionNum = seg.number || (idx + 1).toString();

      // Filter out section title residue, answer keys, or fragments that leaked through
      const isSectionHeader = ContentClassificationEngine.classifyLine(questionText) === 'SECTION_TITLE' ||
                              /^(?:Conventional Type|Multiple Choice Questions|Fill in the Blanks|Column Matching|Analytical Type|Short Answer Type|Long Answer Type|উত্তরমালা)\s*$/i.test(questionText);
      const isAnswerString = ContentClassificationEngine.isAnswerKeyPage(questionText) ||
                             /^\s*\(?[a-dABCDক-ঘi-iv-xI-XV-X]\)?\s*$/i.test(questionText);
      const isTooShort = questionText.length < 5;

      if (isSectionHeader) {
        console.log(`[Structural Validation] Skipped section header: "${questionText}"`);
        continue;
      }
      if (isAnswerString) {
        console.log(`[Structural Validation] Skipped answer grid string: "${questionText}"`);
        continue;
      }
      if (isTooShort) {
        console.log(`[Structural Validation] Skipped too short fragment: "${questionText}"`);
        continue;
      }
      if (seenNumbers.has(questionNum)) {
        console.log(`[Structural Validation] Skipped duplicate question number ${questionNum}`);
        continue;
      }

      seenNumbers.add(questionNum);

      // Perform safe math normalization on final fields
      const sanitizedQuestion = LatexSanitizer.sanitize(parsedBlock.question, confidence);
      const sanitizedOptions = parsedBlock.options.map(o => ({
        label: o.label,
        text: LatexSanitizer.sanitize(o.text, confidence)
      }));

      // PART 10 — DIAGNOSTICS
      const rawOcrData = {
        sourceUsed,
        rawText,
        rawLatex,
        sanitizedLatex,
        confidence,
        chunkText: seg.text,
        preprocessing: preprocessInfo ? preprocessInfo.diagnostics : null,
        preprocessingQuality: preprocessInfo ? preprocessInfo.qualityRating : null,
        diagnostics: {
          rawOcr: seg.text,
          normalizedOcr: parsedBlock.question,
          parserModifications: parsedBlock.format,
          confidenceScore: confidence,
          sectionDetected: activeSection.title,
          answerPageDetected: isAnsKey,
          tableDetected: isTable
        }
      };

      const enrichedQuestion = {
        question: sanitizedQuestion,
        options: sanitizedOptions,
        format: parsedBlock.format || 'line-based',
        questionNumber: questionNum,
        rawChunk: seg.text,
        ocrConfidence: confidence,
        detectionOrder: idx + 1,
        verified: false,
        rawOcrData
      };

      const validationResult = QuestionValidator.validate(enrichedQuestion);
      enrichedQuestion.validation = validationResult;

      const previewData = PreviewRenderer.prepareQuestionPreview({
        questionText: enrichedQuestion.question,
        options: enrichedQuestion.options,
        questionNumber: enrichedQuestion.questionNumber,
        detectionOrder: enrichedQuestion.detectionOrder
      });
      
      if (previewData) {
        enrichedQuestion.preview = previewData;
      }

      parsedQuestions.push(enrichedQuestion);
    }

    // Layer 9: overall quality validation
    const pipelineValidation = OCRResultValidator.validate(rawText, sanitizedLatex, confidence);

    console.log('[OCRPipeline] Modular Execution Complete:', {
      questionsDetected: parsedQuestions.length,
      sourceUsed,
      confidence: pipelineValidation.confidence,
      qualityRating: pipelineValidation.rating
    });

    return {
      rawText: rawText || '',
      latex: sanitizedLatex,
      parsedQuestions,
      confidence: pipelineValidation.confidence,
      qualityRating: pipelineValidation.rating,
      isValid: pipelineValidation.isValid,
      detectionQuality: {
        source: sourceUsed,
        multipleDetected: parsedQuestions.length > 1,
        questionCount: parsedQuestions.length
      }
    };
  }

  /**
   * Helper utility for base64 / URL strings (compatibility handler)
   */
  static async run(src) {
    let buffer;
    let mimetype = 'image/jpeg';
    let filename = 'image.jpg';

    if (src.startsWith('data:')) {
      const [meta, b64] = src.split(',');
      const mimeMatch = meta.match(/data:([^;]+);/);
      if (mimeMatch) mimetype = mimeMatch[1];
      buffer = Buffer.from(b64, 'base64');
    } else if (src.startsWith('http')) {
      const fetchModule = await import('node-fetch');
      const fetch = fetchModule.default;
      const resp = await fetch(src);
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
  QuestionQueueManager,
  OCRResultValidator,
  OCRPipeline
};
