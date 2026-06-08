const router = require('express').Router();
const selfAssessmentController = require('../controllers/selfAssessmentController');
const authMiddleware = require('../middleware/authMiddleware');

const createRateLimiter = require('../middleware/rateLimitMiddleware');
const practiceLimiter = createRateLimiter('practice_generation', 5, 300, 'Too many practice tests generated. Please try again in 5 minutes.');

// All routes require student authentication
router.get('/chapters', authMiddleware, selfAssessmentController.getChapters);
router.post('/generate', authMiddleware, practiceLimiter, selfAssessmentController.generateAssessment);
router.get('/question', authMiddleware, selfAssessmentController.getCurrentQuestion);
router.get('/questions-batch', authMiddleware, selfAssessmentController.getQuestionsBatch);
router.post('/submit', authMiddleware, selfAssessmentController.submitAnswer);
router.post('/submit-all', authMiddleware, selfAssessmentController.submitAllAnswers);
router.post('/heartbeat', authMiddleware, selfAssessmentController.heartbeat);

module.exports = router;
