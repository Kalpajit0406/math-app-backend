'use strict';

const fs = require('fs');

/**
 * Standardized result returned by all extraction engines
 */
class ExtractionResult {
  constructor({
    success = true,
    engine = '',
    questions = [], // Array of formatted question items
    processingTimeMs = 0,
    errorMessage = null
  } = {}) {
    this.success = success;
    this.engine = engine;
    this.questions = questions;
    this.processingTimeMs = processingTimeMs;
    this.errorMessage = errorMessage;
  }
}

/**
 * Base ExtractionEngine Interface
 */
class ExtractionEngine {
  async extract(source, options = {}) {
    throw new Error('extract method must be implemented by subclasses');
  }
}

/**
 * Mathpix OCR Extraction Engine
 */
class MathpixEngine extends ExtractionEngine {
  constructor() {
    super();
    // Dynamically require to avoid circular dependencies
    this.ocrPipeline = require('./ocrPipeline').OCRPipeline;
  }

  async extract(source, options = {}) {
    const startedAt = Date.now();
    try {
      let pipelineResult;
      if (source.type === 'buffer') {
        pipelineResult = await this.ocrPipeline.runFromBuffer(
          source.buffer,
          source.mimetype || 'image/jpeg',
          source.filename || 'image.jpg'
        );
      } else {
        throw new Error('MathpixEngine only supports buffer input style');
      }

      // Map parsed questions to standard format
      const questions = (pipelineResult.parsedQuestions || []).map(q => ({
        questionNumber: q.questionNumber || '',
        questionText: q.questionText || q.question || '',
        options: q.options || ['', '', '', ''],
        correctOption: q.correctOption || null,
        correctAnswer: q.correctAnswer || '',
        explanation: q.explanation || '',
        language: q.language || 'English',
        confidence: q.confidence || 1.0,
        latex: q.latex || false,
        diagramPresent: q.diagramPresent || false,
        diagramDescription: q.diagramDescription || '',
        tags: q.tags || [],
        estimatedTime: q.estimatedTime || ''
      }));

      return new ExtractionResult({
        success: true,
        engine: 'mathpix',
        questions,
        processingTimeMs: Date.now() - startedAt
      });
    } catch (err) {
      return new ExtractionResult({
        success: false,
        engine: 'mathpix',
        errorMessage: err.message,
        processingTimeMs: Date.now() - startedAt
      });
    }
  }
}

/**
 * Gemini Extraction Engine
 */
class GeminiEngine extends ExtractionEngine {
  constructor() {
    super();
    // Dynamically require to avoid circular dependencies
    this.extractionService = require('./geminiExtractionService').GeminiExtractionService;
  }

  async extract(source, options = {}) {
    const startedAt = Date.now();
    try {
      let questions = [];
      if (source.type === 'buffer') {
        questions = await this.extractionService.extractFromBuffer(
          source.buffer,
          source.mimetype,
          options.classNo,
          options.chapterName
        );
      } else if (source.type === 'path') {
        // PDF page extraction or file path
        if (source.mimetype === 'application/pdf') {
          questions = await this.extractionService.extractFromPdfPath(
            source.path,
            options.classNo,
            options.chapterName
          );
        } else {
          // Image path
          const buffer = fs.readFileSync(source.path);
          questions = await this.extractionService.extractFromBuffer(
            buffer,
            source.mimetype || 'image/jpeg',
            options.classNo,
            options.chapterName
          );
        }
      } else {
        throw new Error(`Unsupported source type for GeminiEngine: ${source.type}`);
      }

      return new ExtractionResult({
        success: true,
        engine: 'gemini',
        questions,
        processingTimeMs: Date.now() - startedAt
      });
    } catch (err) {
      return new ExtractionResult({
        success: false,
        engine: 'gemini',
        errorMessage: err.message,
        processingTimeMs: Date.now() - startedAt
      });
    }
  }
}

module.exports = {
  ExtractionResult,
  ExtractionEngine,
  MathpixEngine,
  GeminiEngine
};
