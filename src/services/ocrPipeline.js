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

    // Layer 7: LaTeX sanitization
    const sanitizedLatex = LatexSanitizer.sanitize(rawLatex);

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

    // Layer 6: MCQ option parsing & Layer 9: validation & Layer 10: preview preparation
    const parsedQuestions = segments.map((seg, idx) => {
      // Parse options inside the segment text
      const parsedMCQ = MCQDetector.detect(seg.text) || {
        question: seg.text,
        options: [{ label: 'A', text: '' }, { label: 'B', text: '' }, { label: 'C', text: '' }, { label: 'D', text: '' }],
        format: 'descriptive'
      };

      // Enrich raw OCR trace metrics
      const rawOcrData = {
        sourceUsed,
        rawText,
        rawLatex,
        sanitizedLatex,
        confidence,
        chunkText: seg.text,
        preprocessing: preprocessInfo ? preprocessInfo.diagnostics : null,
        preprocessingQuality: preprocessInfo ? preprocessInfo.qualityRating : null
      };

      const enrichedQuestion = {
        question: LatexSanitizer.sanitize(parsedMCQ.question),
        options: parsedMCQ.options.map(o => ({ label: o.label, text: LatexSanitizer.sanitize(o.text) })),
        format: parsedMCQ.format || 'line-based',
        questionNumber: seg.number || (idx + 1).toString(),
        rawChunk: seg.text,
        ocrConfidence: confidence,
        detectionOrder: idx + 1,
        verified: false,
        rawOcrData
      };

      // Layer 9: question validator
      const validationResult = QuestionValidator.validate(enrichedQuestion);
      enrichedQuestion.validation = validationResult;

      // Layer 10: KaTeX preview rendering
      const previewData = PreviewRenderer.prepareQuestionPreview({
        questionText: enrichedQuestion.question,
        options: enrichedQuestion.options,
        questionNumber: enrichedQuestion.questionNumber,
        detectionOrder: enrichedQuestion.detectionOrder
      });
      
      if (previewData) {
        enrichedQuestion.preview = previewData;
      }

      return enrichedQuestion;
    });

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
