const Attempt = require('../models/attemptModel');
const Exam = require('../models/examModel');

const attemptService = {
  startAttempt: async (userId, examId) => {
    if (!examId) throw new Error('Exam id is required');

    const exam = await Exam.findById(examId);
    if (!exam) throw new Error('Exam not found');

    const activeAttempt = await Attempt.findOne({ userId, examId, endTime: { $exists: false } });
    if (activeAttempt) return activeAttempt;

    const attempt = new Attempt({ userId, examId });
    return await attempt.save();
  },

  submitAttempt: async (userId, attemptId, responses) => {
    if (!attemptId) throw new Error('Attempt id is required');
    if (!Array.isArray(responses)) throw new Error('Responses must be an array');

    const attempt = await Attempt.findById(attemptId);
    if (!attempt) throw new Error('Attempt not found');
    if (String(attempt.userId) !== String(userId)) throw new Error('You are not allowed to submit this attempt');
    if (attempt.endTime) throw new Error('Attempt already submitted');

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
        const isCorrect = String(question.correctAnswer).trim().toLowerCase() === 
                          String(res.userAnswer).trim().toLowerCase();
        if (isCorrect) score++;
        
        evaluatedResponses.push({
          questionId: res.questionId,
          userAnswer: res.userAnswer,
          isCorrect
        });
      }
    }

    attempt.score = score;
    attempt.responses = evaluatedResponses;
    attempt.endTime = new Date();
    
    return await attempt.save();
  },

  getResult: async (userId, role, attemptId) => {
    const result = await Attempt.findById(attemptId).populate('examId', 'title');
    if (!result) throw new Error('Result not found');
    const isOwner = String(result.userId) === String(userId);
    const isPrivileged = role === 'admin' || role === 'teacher';
    if (!isOwner && !isPrivileged) throw new Error('You are not allowed to view this result');
    return result;
  }
};

module.exports = attemptService;
