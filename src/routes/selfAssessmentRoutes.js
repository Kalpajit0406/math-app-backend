const router = require('express').Router();
const selfAssessmentController = require('../controllers/selfAssessmentController');
const authMiddleware = require('../middleware/authMiddleware');

// All routes require student authentication
router.post('/generate', authMiddleware, selfAssessmentController.generateAssessment);
router.get('/question', authMiddleware, selfAssessmentController.getCurrentQuestion);
router.post('/submit', authMiddleware, selfAssessmentController.submitAnswer);
router.post('/heartbeat', authMiddleware, selfAssessmentController.heartbeat);

module.exports = router;
