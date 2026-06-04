const router = require('express').Router();
const selfAssessmentController = require('../controllers/selfAssessmentController');
const authMiddleware = require('../middleware/authMiddleware');

// All routes require student authentication
router.get('/chapters', authMiddleware, selfAssessmentController.getChapters);
router.post('/generate', authMiddleware, selfAssessmentController.generateAssessment);
router.get('/question', authMiddleware, selfAssessmentController.getCurrentQuestion);
router.get('/questions-batch', authMiddleware, selfAssessmentController.getQuestionsBatch);
router.post('/submit', authMiddleware, selfAssessmentController.submitAnswer);
router.post('/submit-all', authMiddleware, selfAssessmentController.submitAllAnswers);
router.post('/heartbeat', authMiddleware, selfAssessmentController.heartbeat);

module.exports = router;
