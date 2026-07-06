/**
 * OCRRecoveryEngine — Manual Review Artifact Generator
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CRITICAL DESIGN CONSTRAINT:
 *   This engine MUST NEVER save or return a question to the database.
 *   Its ONLY job is to produce a structured manual-review artifact that
 *   captures the raw OCR text, parser diagnostics, detected boundaries,
 *   and the exact reason parsing failed.
 *
 *   The artifact is returned so the caller can route it to the QUARANTINE
 *   bucket for human review — NOT to MongoDB question storage.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * NEVER call generateFallbackQuestion() and insert the result into the DB.
 * ALWAYS check the returned artifact's `type === 'MANUAL_REVIEW_ARTIFACT'`
 * before deciding what to do with it.
 */

'use strict';

class OCRRecoveryEngine {

  /**
   * Determine whether OCR output requires recovery intervention.
   * Recovery is only triggered for truly empty or critically low-confidence results.
   * A successful Mathpix extraction with parseable text should NOT trigger recovery.
   *
   * @param {object} ocrResult
   * @returns {boolean}
   */
  static needsRecovery(ocrResult) {
    if (!ocrResult) return true;

    const hasText  = !!(ocrResult.rawText  && ocrResult.rawText.trim());
    const hasLatex = !!(ocrResult.latex     && ocrResult.latex.trim());

    // No usable content at all → recovery needed
    if (!hasText && !hasLatex) return true;

    const textLen = ocrResult.rawText ? ocrResult.rawText.length : (ocrResult.latex ? ocrResult.latex.length : 0);

    // Critically low confidence (< 15%) AND very little text → recovery needed
    // (Mathpix sometimes returns very low confidence scores for long complex documents that are actually fine)
    if (ocrResult.confidence !== null && ocrResult.confidence < 0.15 && textLen < 50) {
        return true;
    }

    return false;
  }

  /**
   * Generate a manual-review artifact from a parsing failure.
   *
   * THIS MUST NEVER BE SAVED TO MONGODB AS A QUESTION.
   * Route the result to the verification queue for human review.
   *
   * @param {object} opts
   * @param {string} opts.rawOcrText      - Full OCR text that could not be parsed
   * @param {string} opts.filename        - Source filename
   * @param {string} opts.failureReason   - Human-readable reason for failure
   * @param {object} opts.diagnostics     - Detailed diagnostic data
   * @param {string[]} opts.detectedBoundaries - Any boundaries that were detected
   * @param {string} opts.pageType        - Classified page type
   * @param {number} opts.questionCount   - How many questions were detected
   * @param {number} opts.ocrConfidence   - OCR confidence score
   * @returns {ManualReviewArtifact}      - NEVER insert this into the questions collection
   */
  static generateManualReviewArtifact({
    rawOcrText      = '',
    filename        = 'unknown.jpg',
    failureReason   = 'Unknown parsing failure',
    diagnostics     = {},
    detectedBoundaries = [],
    pageType        = 'UNKNOWN_PAGE',
    questionCount   = 0,
    ocrConfidence   = 0,
  } = {}) {
    console.warn(`[OCRRecoveryEngine] Generating manual-review artifact. Reason: ${failureReason}`);

    return {
      // Marker: callers MUST check this before any DB operations
      type:           'MANUAL_REVIEW_ARTIFACT',
      requiresManualReview: true,

      // Provenance
      filename,
      createdAt:      new Date().toISOString(),

      // Failure information
      failureReason,
      pageType,
      questionCount,
      ocrConfidence,

      // Raw material for human reviewer
      rawOcrText,
      textLength:     rawOcrText ? rawOcrText.length : 0,

      // Parser diagnostics
      diagnostics: {
        detectedBoundaries,
        ...diagnostics,
      },

      // Human-readable summary for the review UI
      reviewSummary: [
        `Page type: ${pageType}`,
        `OCR confidence: ${(ocrConfidence * 100).toFixed(1)}%`,
        `OCR text length: ${rawOcrText ? rawOcrText.length : 0} chars`,
        `Questions detected: ${questionCount}`,
        `Failure reason: ${failureReason}`,
      ].join('\n'),
    };
  }

  /**
   * @deprecated Use generateManualReviewArtifact() instead.
   * This method is kept only for backward compatibility with call sites
   * that have not yet been migrated, but it now returns a safe artifact
   * instead of a fake question structure.
   */
  static generateFallbackQuestion(errorOrRawText, filename = 'scanned_image.jpg') {
    console.warn('[OCRRecoveryEngine] generateFallbackQuestion() called — returning manual-review artifact. DO NOT save to DB.');

    let rawText = '';
    let failureReason = 'OCR recovery triggered';

    if (errorOrRawText instanceof Error) {
      failureReason = `Error: ${errorOrRawText.message}`;
    } else if (typeof errorOrRawText === 'string') {
      rawText = errorOrRawText;
      failureReason = 'Parser could not segment the OCR text into structured questions';
    }

    return this.generateManualReviewArtifact({
      rawOcrText:    rawText,
      filename,
      failureReason,
      diagnostics:   { source: 'generateFallbackQuestion_compat' },
    });
  }
}

module.exports = { OCRRecoveryEngine };
