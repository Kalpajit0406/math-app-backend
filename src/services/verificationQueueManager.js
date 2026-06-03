/**
 * VerificationQueueManager — Enhanced with full pipeline metadata
 *
 * CHANGES:
 *   - Preserves format, confidenceScores, columnA/B, blanks, matchingChoices
 *   - Stores pipeline metadata (pageType, sections, timing, counts)
 *   - Each item is independently editable without affecting others
 *   - Failed items are isolated — they don't break the session
 */

'use strict';

const VerificationSession = require('../models/verificationSessionModel');

class VerificationQueueManager {

  /**
   * Create and store a new verification session.
   *
   * @param {string} sessionId
   * @param {string} userId
   * @param {Array}  parsedQuestions   - Enriched question objects from OCRPipeline
   * @param {number} ttlSeconds        - Session TTL (default 24h)
   * @param {string} scannedImageUrl
   * @param {object} pipelineMeta      - Optional pipeline metadata
   */
  static async createSession(
    sessionId,
    userId,
    parsedQuestions,
    ttlSeconds = 86400,
    scannedImageUrl = null,
    pipelineMeta = {}
  ) {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const questions = Array.isArray(parsedQuestions) ? parsedQuestions : [];

    const items = questions.map((q, idx) => {
      // ── Map options: accept { label, text } objects or plain strings ──────
      let optionsArray = [];
      if (Array.isArray(q.options)) {
        optionsArray = q.options.map(opt =>
          typeof opt === 'object' && opt !== null ? (opt.text || '') : String(opt || '')
        );
      }
      while (optionsArray.length < 4) optionsArray.push('');

      // ── Confidence scores ─────────────────────────────────────────────────
      const confScores = q.confidenceScores || {};

      // ── Validation result ─────────────────────────────────────────────────
      const validation = q.validation || {};

      return {
        questionText:    q.question || q.questionText || 'Question Text',
        options:         optionsArray.slice(0, 4),
        questionNumber:  q.questionNumber || String(idx + 1),
        detectionOrder:  q.detectionOrder || (idx + 1),

        // Format/type
        format:          q.format || 'mcq',

        // Structured data for non-MCQ
        columnA:         Array.isArray(q.columnA) ? q.columnA : [],
        columnB:         Array.isArray(q.columnB) ? q.columnB : [],
        matchingChoices: Array.isArray(q.matchingChoices) ? q.matchingChoices : [],
        blanks:          Array.isArray(q.blanks) ? q.blanks : [],
        blankCount:      q.blankCount || 0,

        // Confidence
        confidenceScores: {
          ocrConfidence:        confScores.ocrConfidence        ?? q.ocrConfidence ?? null,
          parserConfidence:     confScores.parserConfidence     ?? null,
          layoutConfidence:     confScores.layoutConfidence     ?? null,
          sectionConfidence:    confScores.sectionConfidence    ?? null,
          structuralConfidence: confScores.structuralConfidence ?? null,
          composite:            confScores.composite            ?? null,
          rating:               confScores.rating               ?? 'medium',
        },

        // Raw OCR diagnostics
        rawOcrData: q.rawOcrData || {},

        // Validation
        validationErrors:   Array.isArray(validation.errors)   ? validation.errors   : [],
        validationWarnings: Array.isArray(validation.warnings) ? validation.warnings : [],

        verified:  false,
        isDeleted: false,
      };
    });

    const session = await VerificationSession.create({
      sessionId,
      userId,
      items,
      currentIndex: 0,
      expiresAt,
      scannedImageUrl,
      pipelineMetadata: {
        pageType:         pipelineMeta.pageType         || 'UNKNOWN_PAGE',
        sectionsFound:    pipelineMeta.sectionsFound    || 0,
        totalExtracted:   pipelineMeta.totalExtracted   || items.length,
        totalRejected:    pipelineMeta.totalRejected    || 0,
        sourceUsed:       pipelineMeta.sourceUsed       || 'unknown',
        processingTimeMs: pipelineMeta.processingTimeMs || 0,
      },
    });

    return session;
  }

  /** Retrieve session by ID. */
  static async getSession(sessionId) {
    return await VerificationSession.findOne({ sessionId });
  }

  /** Get all non-deleted items. */
  static async getQueueItems(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) return [];
    return session.items.filter(item => !item.isDeleted);
  }

  /** Get current item from session. */
  static async getCurrentQuestion(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session || session.items.length === 0) return null;
    return session.items[session.currentIndex] || null;
  }

  /** Navigate to next non-deleted item. */
  static async nextQuestion(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    let nextIdx = -1;
    for (let i = session.currentIndex + 1; i < session.items.length; i++) {
      if (!session.items[i].isDeleted) { nextIdx = i; break; }
    }

    if (nextIdx !== -1) {
      session.currentIndex = nextIdx;
      await session.save();
    }
    return session.items[session.currentIndex];
  }

  /** Navigate to previous non-deleted item. */
  static async prevQuestion(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    let prevIdx = -1;
    for (let i = session.currentIndex - 1; i >= 0; i--) {
      if (!session.items[i].isDeleted) { prevIdx = i; break; }
    }

    if (prevIdx !== -1) {
      session.currentIndex = prevIdx;
      await session.save();
    }
    return session.items[session.currentIndex];
  }

  /** Get session status metrics. */
  static async getStatus(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    const activeItems   = session.items.filter(item => !item.isDeleted);
    const verifiedItems = activeItems.filter(item => item.verified);
    const filteredIndex = this.getFilteredIndex(session, session.currentIndex);
    const expiresIn     = Math.max(0, Math.round((session.expiresAt.getTime() - Date.now()) / 1000));

    return {
      total:        activeItems.length,
      verifiedCount: verifiedItems.length,
      currentIndex: filteredIndex,
      currentNumber: session.items[session.currentIndex]?.questionNumber || String(filteredIndex + 1),
      hasNext: filteredIndex < activeItems.length - 1,
      hasPrev: filteredIndex > 0,
      expiresIn,
      pipelineMetadata: session.pipelineMetadata || {},
    };
  }

  /** Mark a question as deleted. */
  static async removeQuestion(sessionId, index) {
    const session = await this.getSession(sessionId);
    if (!session || !session.items[index]) return false;

    session.items[index].isDeleted = true;

    if (session.currentIndex === index) {
      let next = -1;
      for (let i = index + 1; i < session.items.length; i++) {
        if (!session.items[i].isDeleted) { next = i; break; }
      }
      if (next === -1) {
        for (let i = index - 1; i >= 0; i--) {
          if (!session.items[i].isDeleted) { next = i; break; }
        }
      }
      session.currentIndex = next !== -1 ? next : 0;
    }

    await session.save();
    return true;
  }

  /**
   * Update a question's text, options, and verification status.
   * Supports both MCQ fields and non-MCQ structured fields.
   */
  static async updateQuestion(sessionId, index, updateData) {
    const session = await this.getSession(sessionId);
    if (!session || !session.items[index]) return null;

    const item = session.items[index];

    if (updateData.questionText  !== undefined) item.questionText  = updateData.questionText;
    if (updateData.questionNumber !== undefined) item.questionNumber = updateData.questionNumber;
    if (updateData.format         !== undefined) item.format         = updateData.format;

    if (Array.isArray(updateData.options)) {
      item.options = updateData.options.map(o => (typeof o === 'object' ? o.text : o) || '');
      while (item.options.length < 4) item.options.push('');
      item.options = item.options.slice(0, 4);
    }

    // Non-MCQ structured updates
    if (Array.isArray(updateData.columnA))         item.columnA         = updateData.columnA;
    if (Array.isArray(updateData.columnB))         item.columnB         = updateData.columnB;
    if (Array.isArray(updateData.matchingChoices)) item.matchingChoices = updateData.matchingChoices;
    if (Array.isArray(updateData.blanks))          item.blanks          = updateData.blanks;
    if (updateData.blankCount !== undefined)       item.blankCount      = updateData.blankCount;

    if (updateData.verified !== undefined) {
      item.verified = updateData.verified;
      if (updateData.verified) item.verifiedAt = new Date();
    }

    await session.save();
    return item;
  }

  /** Clear / delete the entire session. */
  static async clearSession(sessionId) {
    await VerificationSession.deleteOne({ sessionId });
  }

  /** Map filtered client index → raw MongoDB array index. */
  static getRawIndex(session, filteredIndex) {
    let count = 0;
    for (let i = 0; i < session.items.length; i++) {
      if (!session.items[i].isDeleted) {
        if (count === filteredIndex) return i;
        count++;
      }
    }
    return -1;
  }

  /** Map raw MongoDB array index → filtered client index. */
  static getFilteredIndex(session, rawIndex) {
    let filteredIndex = 0;
    for (let i = 0; i < Math.min(rawIndex, session.items.length); i++) {
      if (!session.items[i].isDeleted) filteredIndex++;
    }
    return filteredIndex;
  }
}

module.exports = { VerificationQueueManager };
