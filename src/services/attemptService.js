const Attempt = require('../models/attemptModel');
const Exam = require('../models/examModel');
const examService = require('./examService');
const {
  evaluateQuestionCorrectness,
  getExamEndTime,
  evaluateAttemptIfNeeded
} = require('../utils/examUtils');
const PerformanceAnalytics = require('./performanceAnalyticsService');

const { getRedisClient } = require('../config/redis');

// In-process fallback lock set (used only when Redis is in MockRedis mode).
// This is safe for single-process deployments (one PM2 fork). For multi-process
// deployments, Redis must be available for cross-process locking.
const submissionLocks = new Set();

// Distributed lock helpers using Redis
async function acquireAttemptLock(attemptId, ttlMs = 15000) {
  const redis = getRedisClient();
  const lockKey = `lock:attempt:${attemptId}`;
  const result = await redis.set(lockKey, 'locked', 'PX', ttlMs, 'NX');
  return result === 'OK';
}

async function releaseAttemptLock(attemptId) {
  const redis = getRedisClient();
  const lockKey = `lock:attempt:${attemptId}`;
  await redis.del(lockKey);
}

// Fisher-Yates shuffle — returns a new array, does not mutate the input.
// Used to generate a distinct question order per student per attempt.
function shuffleArray(arr) {
  const result = arr.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const attemptService = {
  startAttempt: async (userId, examId) => {
    if (!examId) throw new Error('Exam id is required');

    const Student = require('../models/studentModel');
    const [exam, student, existingAttempt, completedAttempt] = await Promise.all([
      examService.getExamById(examId),
      Student.findById(userId),
      Attempt.findOne({ userId, examId, endTime: { $exists: false } }),
      Attempt.findOne({ userId, examId, endTime: { $exists: true } }),
    ]);

    if (!exam) throw new Error('Exam not found');
    if (!student) throw new Error('Student not found');

    if (exam.classNo === 13) {
      if (!student.isJoint || (student.classNo !== 11 && student.classNo !== 12)) {
        throw new Error('You are not eligible for Joint Entrance exams');
      }
      if (exam.chapters && exam.chapters.length > 0) {
        const studentEligibleChapters = [String(student.classNo), 'Joint'];
        const hasEligibleChapter = exam.chapters.some(ch => studentEligibleChapters.includes(ch));
        if (!hasEligibleChapter) {
          throw new Error('You are not eligible for this specific Joint Entrance exam');
        }
      }
    }

    let attempt = existingAttempt;
    if (attempt) {
      // Calculate remaining seconds from when THIS student started (relative)
      const elapsedMs = Date.now() - new Date(attempt.startTime).getTime();
      let remainingSeconds = Math.max(0, Math.ceil((exam.duration * 60 * 1000 - elapsedMs) / 1000));

      // Also cap against the absolute scheduled exam end time so a student who
      // resumes after the window has partially elapsed cannot get more time than
      // the exam slot allows.
      const examEndTime = getExamEndTime(exam);
      if (examEndTime) {
        const now = new Date();
        const secondsUntilAbsoluteEnd = Math.max(0, Math.ceil((examEndTime.getTime() - now.getTime()) / 1000));
        remainingSeconds = Math.min(remainingSeconds, secondsUntilAbsoluteEnd);
      }
      
      // If time has completely expired, auto-submit the attempt
      if (remainingSeconds <= 0) {
        attempt.endTime = new Date();
        await attempt.save();
        throw new Error('Exam time has already expired');
      }

      // Backfill questionOrder for attempts created before this field existed
      // (or any other edge case where it ended up empty), so resuming an
      // in-flight attempt also gets a stable per-student shuffled order.
      if (!attempt.questionOrder || attempt.questionOrder.length === 0) {
        const examQuestionIds = (exam.questionIds || []).map(id => String(id));
        if (examQuestionIds.length > 0) {
          attempt.questionOrder = shuffleArray(examQuestionIds);
          await attempt.save();
        }
      }

      const attemptObj = attempt.toObject();
      attemptObj.remainingSeconds = remainingSeconds;
      return attemptObj;
    }
    // Verify the student hasn't already completed this particular exam
    if (completedAttempt) {
      throw new Error('You have already completed this exam.');
    }

    // Generate a per-student shuffled question order and persist it on the
    // attempt itself, so it stays stable for this student across resumes
    // (app restart, network drop) while being independently randomized for
    // every other student attempting the same exam.
    const examQuestionIds = (exam.questionIds || []).map(id => String(id));
    const questionOrder = examQuestionIds.length > 0 ? shuffleArray(examQuestionIds) : [];

    attempt = new Attempt({ userId, examId, questionOrder });
    const savedAttempt = await attempt.save();
    const attemptObj = savedAttempt.toObject();

    // Calculate remaining seconds for a FRESH attempt.
    // Use the LESSER of:
    //   a) full exam duration (if student starts exactly on time)
    //   b) time remaining until the absolute scheduled end time (prevents late
    //      joiners from getting more time than the exam window allows).
    const examEndTime = getExamEndTime(exam);
    let remainingSeconds = exam.duration * 60;
    if (examEndTime) {
      const now = new Date();
      const secondsUntilEnd = Math.ceil((examEndTime.getTime() - now.getTime()) / 1000);
      if (secondsUntilEnd <= 0) {
        // Exam window has already closed — reject the start attempt.
        // Clean up the just-created attempt record.
        await attempt.deleteOne();
        throw new Error('The exam window has already closed. You cannot start this exam.');
      }
      remainingSeconds = Math.min(remainingSeconds, secondsUntilEnd);
    }

    attemptObj.remainingSeconds = remainingSeconds;
    return attemptObj;
  },

  submitAttempt: async (userId, attemptId, responses, securityMetadata = {}) => {
    if (!attemptId) throw new Error('Attempt id is required');
    if (!Array.isArray(responses)) throw new Error('Responses must be an array');

    const lockKey = String(attemptId);
    const locked = await acquireAttemptLock(lockKey);
    if (!locked) {
      throw new Error('Submission is already in progress for this attempt.');
    }

    try {
      const attempt = await Attempt.findById(attemptId);
      if (!attempt) throw new Error('Attempt not found');
      if (String(attempt.userId) !== String(userId)) throw new Error('You are not allowed to submit this attempt');
      if (attempt.endTime) {
        // Idempotent submit
        return attempt;
      }

      const exam = await examService.getExamById(attempt.examId);
      if (!exam) throw new Error('Exam not found');

      // Check if the exam period (attempt window or scheduled slot) is over
      let attemptEndBoundary = new Date(attempt.startTime.getTime() + exam.duration * 60 * 1000);
      const examEndTime = getExamEndTime(exam);
      if (examEndTime && examEndTime < attemptEndBoundary) {
        attemptEndBoundary = examEndTime;
      }
      const now = new Date();
      const isExamEnded = now >= attemptEndBoundary;

      let score = 0;
      let marksObtained = 0;
      let evaluationSummary = null;
      const evaluatedResponses = [];
      const seenQuestionIds = new Set();

      for (const res of responses) {
        if (!res?.questionId || seenQuestionIds.has(String(res.questionId))) {
          continue;
        }

        const question = exam.questions.id(res.questionId);
        if (question) {
          seenQuestionIds.add(String(res.questionId));
          const userAnswer = res.userAnswer !== undefined ? res.userAnswer : res.selectedAnswer;
          
          let isCorrect = null;
          if (isExamEnded) {
            isCorrect = evaluateQuestionCorrectness(question, userAnswer);
            if (isCorrect) score++;
          }
          
          evaluatedResponses.push({
            questionId: res.questionId,
            userAnswer: userAnswer,
            isCorrect
          });
        }
      }

      if (isExamEnded) {
        const ResultEvaluationService = require('./resultEvaluationService');
        evaluationSummary = ResultEvaluationService.evaluate(
          exam.questions.length,
          evaluatedResponses,
          exam.questions,
          exam.marksPerQuestion || 1.0,
          exam.negativeMarking || 0.0
        );
        score = evaluationSummary.marksObtained;
        marksObtained = evaluationSummary.marksObtained;
      }

      attempt.score = score;
      attempt.marksObtained = marksObtained;
      attempt.evaluationSummary = evaluationSummary;
      attempt.responses = evaluatedResponses;
      attempt.endTime = new Date();

      if (securityMetadata.violations) attempt.violations = securityMetadata.violations;
      if (securityMetadata.isAutoSubmitted !== undefined) attempt.isAutoSubmitted = securityMetadata.isAutoSubmitted;
      if (securityMetadata.autoSubmitReason) attempt.autoSubmitReason = securityMetadata.autoSubmitReason;
      if (securityMetadata.emulatorDetected !== undefined) attempt.emulatorDetected = securityMetadata.emulatorDetected;
      if (securityMetadata.rootDetected !== undefined) attempt.rootDetected = securityMetadata.rootDetected;
      
      const savedAttempt = await attempt.save();

      if (isExamEnded && evaluationSummary) {
        try {
          const Student = require('../models/studentModel');
          const student = await Student.findById(userId);
          if (student && student.studentPhone) {
            await PerformanceAnalytics.savePerformance(
              student.studentPhone,
              attempt._id.toString(),
              'exam',
              evaluationSummary.correctQuestions,
              exam.questions.length
            );
          }
        } catch (err) {
          console.error('Error saving performance for attempt:', err.message);
        }
      }

      return savedAttempt;
    } finally {
      await releaseAttemptLock(lockKey);
    }
  },

  getResult: async (userId, role, attemptId) => {
    const result = await Attempt.findById(attemptId).populate('examId');
    if (!result) throw new Error('Result not found');
    const isOwner = String(result.userId) === String(userId);
    const isPrivileged = role === 'admin' || role === 'teacher';
    if (!isOwner && !isPrivileged) throw new Error('You are not allowed to view this result');
    
    const exam = result.examId;
    if (exam) {
      let attemptEndBoundary = new Date(result.startTime.getTime() + exam.duration * 60 * 1000);
      const examEndTime = getExamEndTime(exam);
      if (examEndTime && examEndTime < attemptEndBoundary) {
        attemptEndBoundary = examEndTime;
      }
      const now = new Date();
      const isExamEnded = now >= attemptEndBoundary;

      if (!isExamEnded && !isPrivileged) {
        const remainingMs = attemptEndBoundary.getTime() - now.getTime();
        const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
        const err = new Error(`Results will be processed and available once the exam period is over.`);
        err.statusCode = 403;
        err.remainingSeconds = remainingSec;
        throw err;
      }

      await evaluateAttemptIfNeeded(result, exam);
    }
    
    return result;
  },

  syncOfflineAttempt: async (userId, examId, responses, securityMetadata = {}) => {
    if (!examId) throw new Error('Exam id is required');
    if (!Array.isArray(responses)) throw new Error('Responses must be an array');

    // Use in-memory lock as fallback when Redis is operating in MockRedis mode
    const lockKey = `${userId}_${examId}`;
    if (submissionLocks.has(lockKey)) {
      throw new Error('Sync operation is already in progress for this exam.');
    }

    submissionLocks.add(lockKey);

    try {
      const exam = await examService.getExamById(examId);
      if (!exam) throw new Error('Exam not found');

      const Student = require('../models/studentModel');
      const student = await Student.findById(userId);
      if (!student) throw new Error('Student not found');

      if (exam.classNo === 13) {
        if (!student.isJoint || (student.classNo !== 11 && student.classNo !== 12)) {
          throw new Error('You are not eligible for Joint Entrance exams');
        }
        if (exam.chapters && exam.chapters.length > 0) {
          const studentEligibleChapters = [String(student.classNo), 'Joint'];
          const hasEligibleChapter = exam.chapters.some(ch => studentEligibleChapters.includes(ch));
          if (!hasEligibleChapter) {
            throw new Error('You are not eligible for this specific Joint Entrance exam');
          }
        }
      }

      // Check if a completed attempt already exists (idempotent)
      let attempt = await Attempt.findOne({ userId, examId, endTime: { $exists: true } });
      if (attempt) {
        return attempt;
      }

      // Check if exam has ended
      const examEndTime = getExamEndTime(exam);
      const now = new Date();
      const isExamEnded = examEndTime ? (now >= examEndTime) : true;

      let score = 0;
      let marksObtained = 0;
      let evaluationSummary = null;
      const evaluatedResponses = [];
      const seenQuestionIds = new Set();

      for (const res of responses) {
        if (!res?.questionId || seenQuestionIds.has(String(res.questionId))) {
          continue;
        }

        const question = exam.questions.id(res.questionId);
        if (question) {
          seenQuestionIds.add(String(res.questionId));
          const userAnswer = res.selectedAnswer !== undefined ? res.selectedAnswer : res.userAnswer;
          
          let isCorrect = null;
          if (isExamEnded) {
            isCorrect = evaluateQuestionCorrectness(question, userAnswer);
            if (isCorrect) score++;
          }
          
          evaluatedResponses.push({
            questionId: res.questionId,
            userAnswer: userAnswer,
            isCorrect
          });
        }
      }

      // Use the same evaluation engine as submitAttempt for consistency
      if (isExamEnded) {
        const ResultEvaluationService = require('./resultEvaluationService');
        evaluationSummary = ResultEvaluationService.evaluate(
          exam.questions.length,
          evaluatedResponses,
          exam.questions,
          exam.marksPerQuestion || 1.0,
          exam.negativeMarking || 0.0
        );
        score = evaluationSummary.marksObtained;
        marksObtained = evaluationSummary.marksObtained;
      }

      // Check if there is an uncompleted attempt — update it
      let savedAttempt;
      attempt = await Attempt.findOne({ userId, examId, endTime: { $exists: false } });
      if (attempt) {
        attempt.score = isExamEnded ? score : 0;
        attempt.marksObtained = isExamEnded ? marksObtained : 0;
        attempt.evaluationSummary = isExamEnded ? evaluationSummary : null;
        attempt.responses = evaluatedResponses;
        attempt.endTime = new Date();
        if (securityMetadata.violations) attempt.violations = securityMetadata.violations;
        if (securityMetadata.isAutoSubmitted !== undefined) attempt.isAutoSubmitted = securityMetadata.isAutoSubmitted;
        if (securityMetadata.autoSubmitReason) attempt.autoSubmitReason = securityMetadata.autoSubmitReason;
        if (securityMetadata.emulatorDetected !== undefined) attempt.emulatorDetected = securityMetadata.emulatorDetected;
        if (securityMetadata.rootDetected !== undefined) attempt.rootDetected = securityMetadata.rootDetected;
        savedAttempt = await attempt.save();
      } else {
        // Create new completed attempt for offline submissions
        attempt = new Attempt({
          userId,
          examId,
          score: isExamEnded ? score : 0,
          marksObtained: isExamEnded ? marksObtained : 0,
          evaluationSummary: isExamEnded ? evaluationSummary : null,
          responses: evaluatedResponses,
          startTime: new Date(Date.now() - (exam.duration * 60 * 1000)),
          endTime: new Date(),
          violations: securityMetadata.violations || [],
          isAutoSubmitted: securityMetadata.isAutoSubmitted || false,
          autoSubmitReason: securityMetadata.autoSubmitReason || null,
          emulatorDetected: securityMetadata.emulatorDetected || false,
          rootDetected: securityMetadata.rootDetected || false
        });
        savedAttempt = await attempt.save();
      }

      if (isExamEnded && evaluationSummary) {
        try {
          if (student && student.studentPhone) {
            const totalQ = exam ? exam.questions.length : savedAttempt.responses.length;
            await PerformanceAnalytics.savePerformance(
              student.studentPhone,
              savedAttempt._id.toString(),
              'exam',
              evaluationSummary.correctQuestions,
              totalQ
            );
          }
        } catch (err) {
          console.error('Error saving performance for offline attempt:', err.message);
        }
      }

      return savedAttempt;
    } finally {
      submissionLocks.delete(lockKey);
    }
  }
};

module.exports = attemptService;
