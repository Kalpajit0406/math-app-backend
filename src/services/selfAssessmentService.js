const crypto = require('crypto');
const Question = require('../models/questionModel');
const SelfAssessmentUsage = require('../models/selfAssessmentUsageModel');
const SelfAssessmentSession = require('../models/selfAssessmentSessionModel');

class SelfAssessmentService {
  /**
   * Helper to format current date in YYYY-MM-DD
   */
  static getTodayString() {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  }

  /**
   * Generates a new secure randomized self-assessment session
   */
  static async generateAssessment(studentId, classNo, deviceFingerprint) {
    const today = this.getTodayString();

    // 1. Quota Check (Server-Side enforced)
    const usage = await SelfAssessmentUsage.findOne({ studentId, date: today });
    if (usage && usage.assessmentCount >= 5) {
      console.warn(`[SelfAssessment] Access blocked: Student ${studentId} exceeded daily self-assessment limit.`);
      throw new Error('COOLDOWN_LIMIT: You have reached the maximum of 5 self-assessments for today.');
    }

    // 2. Select 10 questions randomly matching class level using memory-safe MongoDB $sample
    const questions = await Question.aggregate([
      { $match: { classNo: Number(classNo) } },
      { $sample: { size: 10 } }
    ]);

    if (!questions || questions.length === 0) {
      throw new Error('NO_QUESTIONS: No questions available for your class level currently.');
    }

    const questionIds = questions.map(q => q._id);
    const token = crypto.randomBytes(32).toString('hex');
    const sessionId = `assess_${studentId}_${Date.now()}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 mins session duration

    // 3. Create Session
    const session = new SelfAssessmentSession({
      sessionId,
      studentId,
      classNo: Number(classNo),
      token,
      deviceFingerprint,
      questionPool: questionIds,
      answersSubmitted: new Map(),
      correctAnswersCount: 0,
      currentQuestionIndex: 0,
      status: 'active',
      lastActiveAt: new Date(),
      expiresAt,
    });
    await session.save();

    // 4. Update usage counters atomically
    await SelfAssessmentUsage.findOneAndUpdate(
      { studentId, date: today },
      { $inc: { assessmentCount: 1 }, $set: { lastAssessmentAt: new Date() } },
      { upsert: true, new: true }
    );

    return {
      sessionId: session.sessionId,
      token: session.token,
      totalQuestions: questionIds.length,
      status: session.status,
      expiresAt: session.expiresAt
    };
  }

  /**
   * Dynamic option shuffler (Fisher-Yates)
   */
  static shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Retrieves the current question without exposing answer metadata
   */
  static async getCurrentQuestion(token, deviceFingerprint) {
    const session = await SelfAssessmentSession.findOne({ token, status: 'active' });
    if (!session) {
      throw new Error('SESSION_EXPIRED: Active self-assessment session not found or expired.');
    }

    if (session.deviceFingerprint && session.deviceFingerprint !== deviceFingerprint) {
      throw new Error('DEVICE_VIOLATION: Security fingerprint mismatch.');
    }

    if (Date.now() - session.lastActiveAt.getTime() > 45000) {
      // No activity/heartbeat within 45s, terminate session
      session.status = 'terminated';
      await session.save();
      throw new Error('SESSION_TERMINATED: Session closed due to loss of server authority heartbeats.');
    }

    const { questionPool, currentQuestionIndex } = session;
    if (currentQuestionIndex >= questionPool.length) {
      session.status = 'completed';
      await session.save();
      return { isCompleted: true };
    }

    const currentQuestionId = questionPool[currentQuestionIndex];
    const question = await Question.findById(currentQuestionId);
    if (!question) {
      throw new Error('QUESTION_NOT_FOUND: The requested question is missing from datastore.');
    }

    // Shuffling options dynamically before sending to client
    const shuffledOptions = this.shuffleArray(question.options);

    // Update activity
    session.lastActiveAt = new Date();
    await session.save();

    return {
      isCompleted: false,
      questionId: question._id,
      questionIndex: currentQuestionIndex,
      totalQuestions: questionPool.length,
      questionText: question.question,
      options: shuffledOptions,
      diagram: question.diagram || null,
      chapter: question.chapter
    };
  }

  /**
   * Processes the response server-side and advances session index
   */
  static async submitAnswer(token, questionId, studentAnswer, deviceFingerprint) {
    const session = await SelfAssessmentSession.findOne({ token, status: 'active' });
    if (!session) {
      throw new Error('SESSION_EXPIRED: Active self-assessment session not found.');
    }

    if (session.deviceFingerprint && session.deviceFingerprint !== deviceFingerprint) {
      throw new Error('DEVICE_VIOLATION: Security fingerprint mismatch.');
    }

    const { questionPool, currentQuestionIndex } = session;
    const currentQuestionId = questionPool[currentQuestionIndex];

    if (String(currentQuestionId) !== String(questionId)) {
      throw new Error('SYNC_ERROR: Out of sync request. Resubmit current question.');
    }

    const question = await Question.findById(questionId);
    if (!question) {
      throw new Error('QUESTION_NOT_FOUND: Question not found.');
    }

    // Server-Side Answer Verification (answer is never exposed to client)
    const isCorrect = String(studentAnswer).trim() === String(question.correctAnswer).trim();

    session.answersSubmitted.set(String(questionId), studentAnswer);
    if (isCorrect) {
      session.correctAnswersCount += 1;
    }
    session.currentQuestionIndex += 1;
    session.lastActiveAt = new Date();

    const nextIndex = session.currentQuestionIndex;
    const isCompleted = nextIndex >= questionPool.length;

    if (isCompleted) {
      session.status = 'completed';
    }
    await session.save();

    if (isCompleted) {
      return {
        isCompleted: true,
        results: {
          score: session.correctAnswersCount,
          total: questionPool.length,
          percentage: (session.correctAnswersCount / questionPool.length) * 100,
          analytics: {
            weakTopics: isCorrect ? [] : [question.chapter]
          }
        }
      };
    }

    return {
      isCompleted: false,
      message: 'Answer saved'
    };
  }

  /**
   * Updates last active check for heartbeats
   */
  static async heartbeat(token, deviceFingerprint) {
    const session = await SelfAssessmentSession.findOne({ token, status: 'active' });
    if (!session) {
      throw new Error('SESSION_EXPIRED: Session expired.');
    }

    if (session.deviceFingerprint && session.deviceFingerprint !== deviceFingerprint) {
      throw new Error('DEVICE_VIOLATION: Security fingerprint mismatch.');
    }

    session.lastActiveAt = new Date();
    await session.save();
    return { success: true };
  }

  /**
   * Cleans up stale sessions without active heartbeats
   */
  static async cleanupStaleSessions() {
    const cutoff = new Date(Date.now() - 45000); // 45 seconds timeout
    const result = await SelfAssessmentSession.updateMany(
      { status: 'active', lastActiveAt: { $lt: cutoff } },
      { $set: { status: 'terminated' } }
    );
    if (result.modifiedCount > 0) {
      console.log(`[SelfAssessment] Auto-terminated ${result.modifiedCount} inactive sessions.`);
    }
  }
}

module.exports = SelfAssessmentService;
