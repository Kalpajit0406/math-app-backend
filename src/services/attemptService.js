const Attempt = require('../models/attemptModel');
const Exam = require('../models/examModel');
const {
  evaluateQuestionCorrectness,
  getExamEndTime,
  evaluateAttemptIfNeeded
} = require('../utils/examUtils');
const PerformanceAnalytics = require('./performanceAnalyticsService');

const { getRedisClient } = require('../config/redis');

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

const attemptService = {
  startAttempt: async (userId, examId) => {
    if (!examId) throw new Error('Exam id is required');

    const exam = await Exam.findById(examId);
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

    let attempt = await Attempt.findOne({ userId, examId, endTime: { $exists: false } });
    if (attempt) {
      // Calculate remaining seconds using server time
      const elapsedMs = Date.now() - new Date(attempt.startTime).getTime();
      const remainingSeconds = Math.max(0, Math.ceil((exam.duration * 60 * 1000 - elapsedMs) / 1000));
      
      // If time has completely expired, auto-submit the attempt
      if (remainingSeconds <= 0) {
        attempt.endTime = new Date();
        await attempt.save();
        throw new Error('Exam time has already expired');
      }
      
      const attemptObj = attempt.toObject();
      attemptObj.remainingSeconds = remainingSeconds;
      return attemptObj;
    }

    // Check if there are other exams active/scheduled for this class at the same time
    const { getExamStartTime, getExamEndTime } = require('../utils/examUtils');
    const examStart = getExamStartTime(exam);
    const examEnd = getExamEndTime(exam);

    if (examStart && examEnd) {
      // Find all attempts of this student
      const userAttempts = await Attempt.find({ userId }).populate('examId');
      
      for (const att of userAttempts) {
        if (!att.examId || att.examId.isDeleted) {
          continue;
        }
        
        // Skip current exam
        if (String(att.examId._id) === String(examId)) {
          continue;
        }
        
        const otherExam = att.examId;
        const otherStart = getExamStartTime(otherExam);
        const otherEnd = getExamEndTime(otherExam);
        
        if (otherStart && otherEnd) {
          // Check if the scheduled time windows overlap
          const overlaps = (examStart < otherEnd) && (examEnd > otherStart);
          if (overlaps) {
            throw new Error('You have already attended another exam scheduled at the same time. You can only attend one exam per scheduled slot.');
          }
        }
      }
    }

    attempt = new Attempt({ userId, examId });
    const savedAttempt = await attempt.save();
    const attemptObj = savedAttempt.toObject();
    attemptObj.remainingSeconds = exam.duration * 60;
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

      const exam = await Exam.findById(attempt.examId);
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
        score = evaluationSummary.correctQuestions;
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

      if (isExamEnded) {
        try {
          const Student = require('../models/studentModel');
          const student = await Student.findById(userId);
          if (student && student.studentPhone) {
            await PerformanceAnalytics.savePerformance(
              student.studentPhone,
              attempt._id.toString(),
              'exam',
              score,
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

    const lockKey = `${userId}_${examId}`;
    if (submissionLocks.has(lockKey)) {
      throw new Error('Sync operation is already in progress for this exam.');
    }

    submissionLocks.add(lockKey);

    try {
      const exam = await Exam.findById(examId);
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

      // Check if a completed attempt already exists
      let attempt = await Attempt.findOne({ userId, examId, endTime: { $exists: true } });
      if (attempt) {
        // Idempotent sync
        return attempt;
      }

      // Check if exam has ended
      const examEndTime = getExamEndTime(exam);
      const now = new Date();
      const isExamEnded = examEndTime ? (now >= examEndTime) : true;

      let score = 0;
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

      // Check if there is an uncompleted attempt
      let savedAttempt;
      attempt = await Attempt.findOne({ userId, examId, endTime: { $exists: false } });
      if (attempt) {
        attempt.score = isExamEnded ? score : 0;
        attempt.responses = evaluatedResponses;
        attempt.endTime = new Date();
        if (securityMetadata.violations) attempt.violations = securityMetadata.violations;
        if (securityMetadata.isAutoSubmitted !== undefined) attempt.isAutoSubmitted = securityMetadata.isAutoSubmitted;
        if (securityMetadata.autoSubmitReason) attempt.autoSubmitReason = securityMetadata.autoSubmitReason;
        if (securityMetadata.emulatorDetected !== undefined) attempt.emulatorDetected = securityMetadata.emulatorDetected;
        if (securityMetadata.rootDetected !== undefined) attempt.rootDetected = securityMetadata.rootDetected;
        savedAttempt = await attempt.save();
      } else {
        // Create new completed attempt
        attempt = new Attempt({
          userId,
          examId,
          score: isExamEnded ? score : 0,
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

      if (isExamEnded) {
        try {
          if (student && student.studentPhone) {
            const totalQ = exam ? exam.questions.length : savedAttempt.responses.length;
            await PerformanceAnalytics.savePerformance(
              student.studentPhone,
              savedAttempt._id.toString(),
              'exam',
              score,
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
