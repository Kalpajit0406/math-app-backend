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
    pipelineMeta = {},
    status = 'completed',
    progress = 100
  ) {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const questions = Array.isArray(parsedQuestions) ? parsedQuestions : [];

    const items = [];
    const archiveDocs = [];
    const { QuestionDuplicateDetector } = require('./questionDuplicateDetector');
    const mongoose = require('mongoose');

    for (let idx = 0; idx < questions.length; idx++) {
      const q = questions[idx];
      let optionsArray = [];
      if (Array.isArray(q.options)) {
        optionsArray = q.options.map(opt =>
          typeof opt === 'object' && opt !== null ? (opt.text || '') : String(opt || '')
        );
      }
      while (optionsArray.length < 4) optionsArray.push('');

      const confScores = q.confidenceScores || {};
      const validation = q.validation || {};
      const qText = q.question || q.questionText || 'Question Text';

      const duplicateInfo = {
        detected: false,
        similarity: 0,
        rating: 'Allow normally',
        existingQuestionId: null,
        existingQuestionText: ''
      };

      try {
        const dupResult = await QuestionDuplicateDetector.checkDuplicate({
          question: qText,
          options: optionsArray,
          correctAnswer: q.correctAnswer || '',
          type: q.type || q.format || ((optionsArray && optionsArray.length > 0) ? 'mcq' : 'numeric'),
          classNo: q.classNo || 11
        });
        if (dupResult.duplicateDetected) {
          duplicateInfo.detected = true;
          duplicateInfo.similarity = dupResult.similarity;
          duplicateInfo.rating = dupResult.rating;
          duplicateInfo.existingQuestionId = dupResult.existingQuestion._id || dupResult.existingQuestion.id;
          duplicateInfo.existingQuestionText = dupResult.existingQuestion.question;
        }
      } catch (err) {
        console.error('[VerificationQueueManager] Duplicate check failed for item:', err.message);
      }

      const _id = q._id || q.id || new mongoose.Types.ObjectId();
      const rawData = q.rawOcrData || {};
      const crypto = require('crypto');
      const rawText = rawData.rawText || q.rawChunk || '';
      const ocrHash = crypto.createHash('sha256').update(rawText).digest('hex');

      const compactOcrData = {
        ocrConfidence: confScores.ocrConfidence ?? q.ocrConfidence ?? rawData.confidence ?? null,
        summary: qText.substring(0, 100),
        ocrHash,
        sourceUsed: rawData.sourceUsed || (pipelineMeta && pipelineMeta.sourceUsed) || 'unknown'
      };

      items.push({
        _id,
        questionText:    qText,
        options:         optionsArray.slice(0, 4),
        questionNumber:  q.questionNumber || String(idx + 1),
        detectionOrder:  q.detectionOrder || (idx + 1),
        format:          q.format || 'mcq',
        columnA:         Array.isArray(q.columnA) ? q.columnA : [],
        columnB:         Array.isArray(q.columnB) ? q.columnB : [],
        matchingChoices: Array.isArray(q.matchingChoices) ? q.matchingChoices : [],
        blanks:          Array.isArray(q.blanks) ? q.blanks : [],
        blankCount:      q.blankCount || 0,
        confidenceScores: {
          ocrConfidence:             confScores.ocrConfidence             ?? q.ocrConfidence ?? null,
          parserConfidence:          confScores.parserConfidence          ?? null,
          layoutConfidence:          confScores.layoutConfidence          ?? null,
          sectionConfidence:         confScores.sectionConfidence         ?? null,
          structuralConfidence:      confScores.structuralConfidence      ?? null,
          latexConfidence:           confScores.latexConfidence           ?? null,
          semanticConfidence:        confScores.semanticConfidence        ?? null,
          optionIntegrityConfidence: confScores.optionIntegrityConfidence ?? null,
          boundaryConfidence:        confScores.boundaryConfidence        ?? null,
          composite:                 confScores.composite                 ?? null,
          rating:                    confScores.rating                    ?? 'medium',
        },
        rawOcrData: compactOcrData,
        validationErrors:   Array.isArray(validation.errors)   ? validation.errors   : [],
        validationWarnings: Array.isArray(validation.warnings) ? validation.warnings : [],
        quarantineReasons:  Array.isArray(q.quarantineReasons) ? q.quarantineReasons : [],
        verified:        false,
        isDeleted:       false,
        extractionState: q.extractionState || 'ACCEPTED',
        duplicateInfo
      });

      if (Object.keys(rawData).length > 0) {
        archiveDocs.push({
          sessionId,
          itemId: _id,
          rawOcrData: rawData
        });
      }
    }

    const VerificationSessionItem = require('../models/verificationSessionItemModel');
    const itemsWithSessionId = items.map(item => ({ ...item, sessionId, expiresAt }));
    await VerificationSessionItem.insertMany(itemsWithSessionId);

    let duplicatesPrevented = 0;
    let quarantinedQuestions = 0;
    let answerKeysFound = 0;
    for (const item of items) {
      if (item.duplicateInfo?.detected) {
        duplicatesPrevented++;
      }
      if (item.extractionState === 'QUARANTINED') {
        quarantinedQuestions++;
      }
      if (item.correctAnswer) {
        answerKeysFound++;
      }
    }

    const expectedQuestions = pipelineMeta.expectedQuestions || 0;
    const totalRejected = pipelineMeta.totalRejected || 0;
    const footerPollutionDetected = pipelineMeta.footerPollutionDetected || false;
    const chapterHeadingsRemoved = pipelineMeta.chapterHeadingsRemoved || 0;

    const missingQuestions = Math.max(0, expectedQuestions - items.length);
    let completenessStatus = 'COMPLETE';
    let warningMessage = null;
    if (expectedQuestions > 0) {
      const completenessRatio = items.length / expectedQuestions;
      if (completenessRatio < 0.90) {
        completenessStatus = 'INCOMPLETE';
        warningMessage = `Missing questions detected. Expected: ${expectedQuestions}, Extracted: ${items.length}`;
      }
    }

    const failedPages = pipelineMeta.failedPages || [];

    let score = 100;
    score -= quarantinedQuestions * 5;
    score -= missingQuestions * 10;
    if (completenessStatus === 'INCOMPLETE') {
      score -= 15;
    }
    score -= totalRejected * 3;
    if (footerPollutionDetected) {
      score -= 5;
    }
    score -= failedPages.length * 20; // Penalize 20 points per failed page
    score += Math.min(10, duplicatesPrevented * 2);
    score += Math.min(5, chapterHeadingsRemoved * 1);
    const overallQualityScore = Math.max(0, Math.min(100, Math.round(score)));

    const qaReport = {
      expectedQuestions,
      extractedQuestions: items.length,
      missingQuestions,
      answerKeysFound: answerKeysFound || pipelineMeta.answerKeysFound || 0,
      footerPollutionDetected,
      chapterHeadingsRemoved,
      duplicatesPrevented,
      quarantinedQuestions,
      overallQualityScore,
      completenessStatus,
      warningMessage,
      failedPages
    };

    const session = await VerificationSession.create({
      sessionId,
      userId,
      currentIndex: 0,
      expiresAt,
      scannedImageUrl,
      status,
      progress,
      pipelineMetadata: {
        pageType:         pipelineMeta.pageType         || 'UNKNOWN_PAGE',
        sectionsFound:    pipelineMeta.sectionsFound    || 0,
        totalExtracted:   pipelineMeta.totalExtracted   || items.length,
        totalRejected:    pipelineMeta.totalRejected    || 0,
        sourceUsed:       pipelineMeta.sourceUsed       || 'unknown',
        processingTimeMs: pipelineMeta.processingTimeMs || 0,
      },
      qaReport
    });

    if (archiveDocs.length > 0) {
      try {
        const OcrArchive = require('../models/ocrArchiveModel');
        await OcrArchive.insertMany(archiveDocs);
      } catch (err) {
        console.error('[VerificationQueueManager] Failed to write OCR archive in createSession:', err.message);
      }
    }

    return await session.populate('items');
  }

  /** Update session items, status, and progress. */
  static async updateSession(sessionId, updates) {
    if (updates.items && Array.isArray(updates.items)) {
      const formattedItems = [];
      const archiveDocs = [];
      const { QuestionDuplicateDetector } = require('./questionDuplicateDetector');
      const mongoose = require('mongoose');

      for (let idx = 0; idx < updates.items.length; idx++) {
        const q = updates.items[idx];
        let optionsArray = [];
        if (Array.isArray(q.options)) {
          optionsArray = q.options.map(opt =>
            typeof opt === 'object' && opt !== null ? (opt.text || '') : String(opt || '')
          );
        }
        while (optionsArray.length < 4) optionsArray.push('');

        const confScores = q.confidenceScores || {};
        const validation = q.validation || {};
        const qText = q.question || q.questionText || 'Question Text';

        let duplicateInfo = q.duplicateInfo;
        if (!duplicateInfo || !duplicateInfo.detected) {
          duplicateInfo = {
            detected: false,
            similarity: 0,
            rating: 'Allow normally',
            existingQuestionId: null,
            existingQuestionText: ''
          };
          try {
            const dupResult = await QuestionDuplicateDetector.checkDuplicate({
              question: qText,
              options: optionsArray,
              correctAnswer: q.correctAnswer || '',
              type: q.type || q.format || ((optionsArray && optionsArray.length > 0) ? 'mcq' : 'numeric'),
              classNo: q.classNo || 11
            });
            if (dupResult.duplicateDetected) {
              duplicateInfo.detected = true;
              duplicateInfo.similarity = dupResult.similarity;
              duplicateInfo.rating = dupResult.rating;
              duplicateInfo.existingQuestionId = dupResult.existingQuestion._id || dupResult.existingQuestion.id;
              duplicateInfo.existingQuestionText = dupResult.existingQuestion.question;
            }
          } catch (err) {
            console.error('[VerificationQueueManager] Duplicate check failed on update:', err.message);
          }
        }

        const _id = q._id || q.id || new mongoose.Types.ObjectId();
        const rawData = q.rawOcrData || {};
        const crypto = require('crypto');
        const rawText = rawData.rawText || q.rawChunk || '';
        const ocrHash = crypto.createHash('sha256').update(rawText).digest('hex');

        const compactOcrData = {
          ocrConfidence: confScores.ocrConfidence ?? q.ocrConfidence ?? rawData.confidence ?? null,
          summary: qText.substring(0, 100),
          ocrHash,
          sourceUsed: rawData.sourceUsed || 'unknown'
        };

        formattedItems.push({
          _id,
          questionText:    qText,
          options:         optionsArray.slice(0, 4),
          questionNumber:  q.questionNumber || String(idx + 1),
          detectionOrder:  q.detectionOrder || (idx + 1),
          format:          q.format || 'mcq',
          columnA:         Array.isArray(q.columnA) ? q.columnA : [],
          columnB:         Array.isArray(q.columnB) ? q.columnB : [],
          matchingChoices: Array.isArray(q.matchingChoices) ? q.matchingChoices : [],
          blanks:          Array.isArray(q.blanks) ? q.blanks : [],
          blankCount:      q.blankCount || 0,
          confidenceScores: {
            ocrConfidence:             confScores.ocrConfidence             ?? q.ocrConfidence ?? null,
            parserConfidence:          confScores.parserConfidence          ?? null,
            layoutConfidence:          confScores.layoutConfidence          ?? null,
            sectionConfidence:         confScores.sectionConfidence         ?? null,
            structuralConfidence:      confScores.structuralConfidence      ?? null,
            latexConfidence:           confScores.latexConfidence           ?? null,
            semanticConfidence:        confScores.semanticConfidence        ?? null,
            optionIntegrityConfidence: confScores.optionIntegrityConfidence ?? null,
            boundaryConfidence:        confScores.boundaryConfidence        ?? null,
            composite:                 confScores.composite                 ?? null,
            rating:                    confScores.rating                    ?? 'medium',
          },
          rawOcrData: compactOcrData,
          validationErrors:   Array.isArray(validation.errors)   ? validation.errors   : [],
          validationWarnings: Array.isArray(validation.warnings) ? validation.warnings : [],
          quarantineReasons:  Array.isArray(q.quarantineReasons) ? q.quarantineReasons : [],
          verified:        q.verified || false,
          isDeleted:       q.isDeleted || false,
          extractionState: q.extractionState || 'ACCEPTED',
          duplicateInfo
        });

        if (Object.keys(rawData).length > 0) {
          archiveDocs.push({
            sessionId,
            itemId: _id,
            rawOcrData: rawData
          });
        }
      }
      const VerificationSessionItem = require('../models/verificationSessionItemModel');
      const sessionDoc = await VerificationSession.findOne({ sessionId });
      const expiresAt = sessionDoc ? sessionDoc.expiresAt : new Date(Date.now() + 86400 * 1000);

      await VerificationSessionItem.deleteMany({ sessionId });
      const itemsWithSessionId = formattedItems.map(item => ({ ...item, sessionId, expiresAt }));
      await VerificationSessionItem.insertMany(itemsWithSessionId);

      delete updates.items;

      if (archiveDocs.length > 0) {
        try {
          const OcrArchive = require('../models/ocrArchiveModel');
          await OcrArchive.deleteMany({ sessionId });
          await OcrArchive.insertMany(archiveDocs);
        } catch (err) {
          console.error('[VerificationQueueManager] Failed to write OCR archive in updateSession:', err.message);
        }
      }
    }

    const updated = await VerificationSession.findOneAndUpdate({ sessionId }, { $set: updates }, { returnDocument: 'after' });
    if (updated) {
      await updated.populate('items');
    }
    return updated;
  }

  /** Retrieve session by ID. */
  static async getSession(sessionId, dbSession = null) {
    const query = VerificationSession.findOne({ sessionId }).populate('items');
    if (dbSession) query.session(dbSession);
    return await query;
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

    await session.items[index].save();
    await session.save();
    return true;
  }

  /**
   * Update a question's text, options, and verification status.
   * Supports both MCQ fields and non-MCQ structured fields.
   */
  static async updateQuestion(sessionId, index, updateData, dbSession = null) {
    const session = await this.getSession(sessionId, dbSession);
    if (!session || !session.items[index]) return null;

    const item = session.items[index];

    if (updateData.questionText  !== undefined) {
      item.questionText  = updateData.questionText;

      const { QuestionDuplicateDetector } = require('./questionDuplicateDetector');
      const duplicateInfo = {
        detected: false,
        similarity: 0,
        rating: 'Allow normally',
        existingQuestionId: null,
        existingQuestionText: ''
      };

      try {
        const qOptions = updateData.options || item.options || [];
        const qCorrectAnswer = updateData.correctAnswer || item.correctAnswer || '';
        const qFormat = updateData.format || item.format || '';
        const dupResult = await QuestionDuplicateDetector.checkDuplicate({
          question: updateData.questionText,
          options: qOptions.map(o => (typeof o === 'object' ? o.text : o) || ''),
          correctAnswer: qCorrectAnswer,
          type: qFormat,
          classNo: updateData.classNo || item.classNo || 11
        });
        if (dupResult.duplicateDetected) {
          duplicateInfo.detected = true;
          duplicateInfo.similarity = dupResult.similarity;
          duplicateInfo.rating = dupResult.rating;
          duplicateInfo.existingQuestionId = dupResult.existingQuestion._id || dupResult.existingQuestion.id;
          duplicateInfo.existingQuestionText = dupResult.existingQuestion.question;
        }
      } catch (err) {
        console.error('[VerificationQueueManager] Duplicate check failed on updateQuestion:', err.message);
      }
      item.duplicateInfo = duplicateInfo;
    }
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

    await session.save({ session: dbSession ? dbSession : undefined });
    return item;
  }

  /** Clear / delete the entire session. */
  static async clearSession(sessionId) {
    await VerificationSession.deleteOne({ sessionId });
    const VerificationSessionItem = require('../models/verificationSessionItemModel');
    await VerificationSessionItem.deleteMany({ sessionId });
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
