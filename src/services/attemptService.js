const Attempt = require('../models/attemptModel');
const Exam = require('../models/examModel');

// In-memory locks to prevent concurrent double-submissions
const submissionLocks = new Set();

const evaluateQuestionCorrectness = (question, userAnswer) => {
  if (!question || userAnswer === undefined || userAnswer === null) return false;
  
  const qAns = String(question.correctAnswer).trim().toLowerCase();
  const uAns = String(userAnswer).trim().toLowerCase();
  
  if (qAns === uAns) return true;
  
  const options = question.options || [];
  const correctLetterIdx = ['a', 'b', 'c', 'd'].indexOf(qAns);
  const correctOptionText = correctLetterIdx !== -1 && correctLetterIdx < options.length 
    ? String(options[correctLetterIdx]).trim().toLowerCase() 
    : null;
  
  if (correctOptionText && correctOptionText === uAns) return true;
  
  const userLetterIdx = ['a', 'b', 'c', 'd'].indexOf(uAns);
  const userOptionText = userLetterIdx !== -1 && userLetterIdx < options.length 
    ? String(options[userLetterIdx]).trim().toLowerCase() 
    : null;
  
  if (userOptionText && qAns === userOptionText) return true;
  
  return false;
};

const attemptService = {
  startAttempt: async (userId, examId) => {
    if (!examId) throw new Error('Exam id is required');

    const exam = await Exam.findById(examId);
    if (!exam) throw new Error('Exam not found');

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
    if (submissionLocks.has(lockKey)) {
      throw new Error('Submission is already in progress for this attempt.');
    }
    
    submissionLocks.add(lockKey);

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
          const userAnswer = res.userAnswer !== undefined ? res.userAnswer : res.selectedAnswer;
          const isCorrect = evaluateQuestionCorrectness(question, userAnswer);
          if (isCorrect) score++;
          
          evaluatedResponses.push({
            questionId: res.questionId,
            userAnswer: userAnswer,
            isCorrect
          });
        }
      }

      attempt.score = score;
      attempt.responses = evaluatedResponses;
      attempt.endTime = new Date();

      if (securityMetadata.violations) attempt.violations = securityMetadata.violations;
      if (securityMetadata.isAutoSubmitted !== undefined) attempt.isAutoSubmitted = securityMetadata.isAutoSubmitted;
      if (securityMetadata.autoSubmitReason) attempt.autoSubmitReason = securityMetadata.autoSubmitReason;
      if (securityMetadata.emulatorDetected !== undefined) attempt.emulatorDetected = securityMetadata.emulatorDetected;
      if (securityMetadata.rootDetected !== undefined) attempt.rootDetected = securityMetadata.rootDetected;
      
      return await attempt.save();
    } finally {
      submissionLocks.delete(lockKey);
    }
  },

  getResult: async (userId, role, attemptId) => {
    const result = await Attempt.findById(attemptId).populate('examId', 'title');
    if (!result) throw new Error('Result not found');
    const isOwner = String(result.userId) === String(userId);
    const isPrivileged = role === 'admin' || role === 'teacher';
    if (!isOwner && !isPrivileged) throw new Error('You are not allowed to view this result');
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

      // Check if a completed attempt already exists
      let attempt = await Attempt.findOne({ userId, examId, endTime: { $exists: true } });
      if (attempt) {
        // Idempotent sync
        return attempt;
      }

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
          const isCorrect = evaluateQuestionCorrectness(question, userAnswer);
          if (isCorrect) score++;
          
          evaluatedResponses.push({
            questionId: res.questionId,
            userAnswer: userAnswer,
            isCorrect
          });
        }
      }

      // Check if there is an uncompleted attempt
      attempt = await Attempt.findOne({ userId, examId, endTime: { $exists: false } });
      if (attempt) {
        attempt.score = score;
        attempt.responses = evaluatedResponses;
        attempt.endTime = new Date();
        if (securityMetadata.violations) attempt.violations = securityMetadata.violations;
        if (securityMetadata.isAutoSubmitted !== undefined) attempt.isAutoSubmitted = securityMetadata.isAutoSubmitted;
        if (securityMetadata.autoSubmitReason) attempt.autoSubmitReason = securityMetadata.autoSubmitReason;
        if (securityMetadata.emulatorDetected !== undefined) attempt.emulatorDetected = securityMetadata.emulatorDetected;
        if (securityMetadata.rootDetected !== undefined) attempt.rootDetected = securityMetadata.rootDetected;
        return await attempt.save();
      }

      // Create new completed attempt
      attempt = new Attempt({
        userId,
        examId,
        score,
        responses: evaluatedResponses,
        startTime: new Date(Date.now() - (exam.duration * 60 * 1000)),
        endTime: new Date(),
        violations: securityMetadata.violations || [],
        isAutoSubmitted: securityMetadata.isAutoSubmitted || false,
        autoSubmitReason: securityMetadata.autoSubmitReason || null,
        emulatorDetected: securityMetadata.emulatorDetected || false,
        rootDetected: securityMetadata.rootDetected || false
      });

      return await attempt.save();
    } finally {
      submissionLocks.delete(lockKey);
    }
  }
};

module.exports = attemptService;
