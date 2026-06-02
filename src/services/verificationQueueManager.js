const VerificationSession = require('../models/verificationSessionModel');

/**
 * VerificationQueueManager
 * Persistent MongoDB-backed verification session driver.
 * Ensures teachers' OCR pipelines survive server restarts and support navigation.
 */
class VerificationQueueManager {
  /**
   * Create and store a new verification session.
   * @param {string} sessionId - Unique session ID
   * @param {string} userId - ID of the user initiating the session
   * @param {Array} parsedQuestions - Parsed questions from OCR
   * @param {number} ttlSeconds - Session expiration time (default 24 hours = 86400)
   */
  static async createSession(sessionId, userId, parsedQuestions, ttlSeconds = 86400, scannedImageUrl = null) {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const questions = Array.isArray(parsedQuestions) ? parsedQuestions : [];

    const items = questions.map((q, idx) => {
      // Map options array of object {label, text} to simple string array if needed
      let optionsArray = [];
      if (Array.isArray(q.options)) {
        optionsArray = q.options.map(opt => (typeof opt === 'object' && opt !== null) ? opt.text : opt);
      }
      
      // Ensure exactly 4 options
      while (optionsArray.length < 4) {
        optionsArray.push('');
      }

      return {
        questionText: q.question || 'Question Text',
        options: optionsArray.slice(0, 4),
        questionNumber: q.questionNumber || (idx + 1).toString(),
        detectionOrder: q.detectionOrder || (idx + 1),
        rawOcrData: q.rawOcrData || {},
        verified: false,
        isDeleted: false
      };
    });

    const session = await VerificationSession.create({
      sessionId,
      userId,
      items,
      currentIndex: 0,
      expiresAt,
      scannedImageUrl
    });

    return session;
  }

  /**
   * Retrieve session by ID.
   * @param {string} sessionId
   */
  static async getSession(sessionId) {
    return await VerificationSession.findOne({ sessionId });
  }

  /**
   * Get all items of the session (excluding deleted ones if specified).
   * @param {string} sessionId
   */
  static async getQueueItems(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) return [];
    return session.items.filter(item => !item.isDeleted);
  }

  /**
   * Get current item from the session.
   * @param {string} sessionId
   */
  static async getCurrentQuestion(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session || session.items.length === 0) return null;
    return session.items[session.currentIndex] || null;
  }

  /**
   * Navigate to next item.
   * @param {string} sessionId
   */
  static async nextQuestion(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) return null;
    
    let nextRawIndex = -1;
    for (let i = session.currentIndex + 1; i < session.items.length; i++) {
      if (!session.items[i].isDeleted) {
        nextRawIndex = i;
        break;
      }
    }
    
    if (nextRawIndex !== -1) {
      session.currentIndex = nextRawIndex;
      await session.save();
    }
    return session.items[session.currentIndex];
  }

  /**
   * Navigate to previous item.
   * @param {string} sessionId
   */
  static async prevQuestion(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) return null;
    
    let prevRawIndex = -1;
    for (let i = session.currentIndex - 1; i >= 0; i--) {
      if (!session.items[i].isDeleted) {
        prevRawIndex = i;
        break;
      }
    }
    
    if (prevRawIndex !== -1) {
      session.currentIndex = prevRawIndex;
      await session.save();
    }
    return session.items[session.currentIndex];
  }

  /**
   * Get session status metrics.
   * @param {string} sessionId
   */
  static async getStatus(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) return null;
    const activeItems = session.items.filter(item => !item.isDeleted);
    const verifiedItems = activeItems.filter(item => item.verified);
    const expiresSeconds = Math.max(0, Math.round((session.expiresAt.getTime() - Date.now()) / 1000));
    const filteredIndex = this.getFilteredIndex(session, session.currentIndex);

    return {
      total: activeItems.length,
      verifiedCount: verifiedItems.length,
      currentIndex: filteredIndex,
      currentNumber: session.items[session.currentIndex]?.questionNumber || (filteredIndex + 1).toString(),
      hasNext: filteredIndex < activeItems.length - 1,
      hasPrev: filteredIndex > 0,
      expiresIn: expiresSeconds
    };
  }

  /**
   * Mark a question as deleted in the session.
   * @param {string} sessionId
   * @param {number} index
   */
  static async removeQuestion(sessionId, index) {
    const session = await this.getSession(sessionId);
    if (!session || !session.items[index]) return false;
    
    session.items[index].isDeleted = true;
    
    // Adjust current index if it now points to a deleted item or out of bounds
    if (session.currentIndex === index) {
      let nextActive = -1;
      for (let i = index + 1; i < session.items.length; i++) {
        if (!session.items[i].isDeleted) {
          nextActive = i;
          break;
        }
      }
      
      if (nextActive !== -1) {
        session.currentIndex = nextActive;
      } else {
        let prevActive = -1;
        for (let i = index - 1; i >= 0; i--) {
          if (!session.items[i].isDeleted) {
            prevActive = i;
            break;
          }
        }
        session.currentIndex = prevActive !== -1 ? prevActive : 0;
      }
    }
    
    await session.save();
    return true;
  }

  /**
   * Update question text and options for a session item.
   * @param {string} sessionId
   * @param {number} index
   * @param {object} updateData - { questionText, options, questionNumber }
   */
  static async updateQuestion(sessionId, index, updateData) {
    const session = await this.getSession(sessionId);
    if (!session || !session.items[index]) return null;

    const item = session.items[index];
    if (updateData.questionText !== undefined) item.questionText = updateData.questionText;
    if (updateData.questionNumber !== undefined) item.questionNumber = updateData.questionNumber;
    if (Array.isArray(updateData.options)) {
      item.options = updateData.options;
      while (item.options.length < 4) {
        item.options.push('');
      }
      item.options = item.options.slice(0, 4);
    }
    if (updateData.verified !== undefined) {
      item.verified = updateData.verified;
      if (updateData.verified) {
        item.verifiedAt = new Date();
      }
    }

    await session.save();
    return item;
  }

  /**
   * Clear or delete session entirely.
   * @param {string} sessionId
   */
  static async clearSession(sessionId) {
    await VerificationSession.deleteOne({ sessionId });
  }

  /**
   * Resolve filtered index (from client view) to raw array index in MongoDB.
   * @param {object} session
   * @param {number} filteredIndex
   */
  static getRawIndex(session, filteredIndex) {
    let count = 0;
    for (let i = 0; i < session.items.length; i++) {
      if (!session.items[i].isDeleted) {
        if (count === filteredIndex) {
          return i;
        }
        count++;
      }
    }
    return -1;
  }

  /**
   * Resolve raw array index in MongoDB to filtered index (from client view).
   * @param {object} session
   * @param {number} rawIndex
   */
  static getFilteredIndex(session, rawIndex) {
    let filteredIndex = 0;
    for (let i = 0; i < Math.min(rawIndex, session.items.length); i++) {
      if (!session.items[i].isDeleted) {
        filteredIndex++;
      }
    }
    return filteredIndex;
  }
}

module.exports = { VerificationQueueManager };
