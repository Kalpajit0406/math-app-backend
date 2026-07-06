'use strict';

class GeminiValidator {
  /**
   * Validate a question parsed by Gemini
   * @param {object} q - Question object from Gemini
   * @param {number} minConfidence - Minimum confidence score required
   * @returns {{isValid: boolean, errors: string[]}}
   */
  static validateQuestion(q, minConfidence = 0.60) {
    const errors = [];

    // 1. Question text exists
    const qText = (q.questionText || q.question || '').trim();
    if (!qText) {
      errors.push('Question text is missing or empty.');
    }

    // 2. Options check (for MCQ)
    const options = q.options || [];
    if (!Array.isArray(options) || options.length !== 4) {
      errors.push(`MCQ must have exactly 4 options. Found ${options.length}.`);
    } else {
      // 3. No duplicate options
      const nonUnique = options.filter((item, index) => options.indexOf(item) !== index && item.trim() !== '');
      if (nonUnique.length > 0) {
        errors.push(`Duplicate options detected: ${nonUnique.join(', ')}.`);
      }
    }

    // 4. Correct answer/option exists
    const correctOpt = (q.correctOption || '').trim();
    const correctAns = (q.correctAnswer || '').trim();
    if (!correctOpt && !correctAns) {
      errors.push('Correct option or correct answer must be specified.');
    }

    // 5. Confidence score above threshold
    const conf = q.confidence !== undefined ? parseFloat(q.confidence) : 1.0;
    if (conf < minConfidence) {
      errors.push(`Confidence score (${conf.toFixed(2)}) is below the required threshold (${minConfidence.toFixed(2)}).`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

module.exports = { GeminiValidator };
