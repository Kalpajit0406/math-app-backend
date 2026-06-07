const attemptService = require('../services/attemptService');

const startAttempt = async (req, res) => {
  try {
    const { examId } = req.body;
    const attempt = await attemptService.startAttempt(req.user.id, examId);
    res.status(201).json({ success: true, data: attempt });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const submitAttempt = async (req, res) => {
  try {
    const { attemptId, responses, violations, isAutoSubmitted, autoSubmitReason, emulatorDetected, rootDetected } = req.body;
    const result = await attemptService.submitAttempt(req.user.id, attemptId, responses, {
      violations,
      isAutoSubmitted,
      autoSubmitReason,
      emulatorDetected,
      rootDetected
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getResult = async (req, res) => {
  try {
    const result = await attemptService.getResult(req.user.id, req.user.role, req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    const statusCode = error.message === 'Result not found' ? 404 : 403;
    res.status(statusCode).json({ success: false, message: error.message });
  }
};

const getLeaderboard = async (req, res) => {
  try {
    const { examId } = req.params;
    const Attempt = require('../models/attemptModel');
    const Exam = require('../models/examModel');
    const { getExamEndTime, evaluateAttemptIfNeeded } = require('../utils/examUtils');

    const exam = await Exam.findById(examId);
    if (exam) {
      const examEndTime = getExamEndTime(exam);
      const now = new Date();
      const isExamEnded = examEndTime ? (now >= examEndTime) : true;

      if (isExamEnded) {
        // Find all completed attempts for this exam that still have unevaluated responses
        const unevaluatedAttempts = await Attempt.find({
          examId,
          endTime: { $exists: true },
          'responses.isCorrect': null
        });

        for (const attempt of unevaluatedAttempts) {
          try {
            await evaluateAttemptIfNeeded(attempt, exam);
          } catch (err) {
            console.error(`Error auto-evaluating attempt ${attempt._id} in leaderboard:`, err.message);
          }
        }
      }
    }
    
    const leaderboard = await Attempt.find({ examId })
      .populate('userId', 'firstName lastName studentPhone')
      .sort({ score: -1, endTime: 1 });

    res.json({ success: true, data: leaderboard });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const syncOfflineAttempt = async (req, res) => {
  res.status(400).json({
    success: false,
    message: 'Offline mode is deprecated. All exam attempts must remain connected to the live server session.'
  });
};

const getCompletedExamIds = async (req, res) => {
  try {
    const Attempt = require('../models/attemptModel');
    const attempts = await Attempt.find({ userId: req.user.id, endTime: { $exists: true } });
    const examIds = attempts.map(a => a.examId.toString());
    res.json({ success: true, data: examIds });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { startAttempt, submitAttempt, getResult, getLeaderboard, syncOfflineAttempt, getCompletedExamIds };
