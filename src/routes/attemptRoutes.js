const express = require('express');
const router = express.Router();
const attemptController = require('../controllers/attemptController');
const authMiddleware = require('../middleware/authMiddleware');
const { validationRules } = require('../middleware/validationMiddleware');

router.post('/start', authMiddleware, attemptController.startAttempt);
router.post('/submit', authMiddleware, validationRules.submitAttemptValidation, attemptController.submitAttempt);
router.post('/sync-offline', authMiddleware, validationRules.syncOfflineAttemptValidation, attemptController.syncOfflineAttempt);
router.get('/result/:id', authMiddleware, attemptController.getResult);
router.get('/leaderboard/:examId', authMiddleware, attemptController.getLeaderboard);

module.exports = router;
