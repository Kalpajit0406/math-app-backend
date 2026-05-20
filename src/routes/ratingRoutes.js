const express = require('express');
const router = express.Router();
const ratingController = require('../controllers/ratingController');
const authMiddleware = require('../middleware/authMiddleware');

// All rating endpoints require authentication
router.use(authMiddleware);

// Rate a question
router.post('/rate', ratingController.rateQuestion);

// Get analytics for a single question
router.get('/analytics/:questionId', ratingController.getQuestionAnalytics);

// Get analytics for all questions in an exam
router.get('/exam-analytics/:examId', ratingController.getExamQuestionsAnalytics);

module.exports = router;
