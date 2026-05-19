const express = require('express');
const router = express.Router();
const attemptController = require('../controllers/attemptController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/start', authMiddleware, attemptController.startAttempt);
router.post('/submit', authMiddleware, attemptController.submitAttempt);
router.post('/sync-offline', authMiddleware, attemptController.syncOfflineAttempt);
router.get('/result/:id', authMiddleware, attemptController.getResult);
router.get('/leaderboard/:examId', authMiddleware, attemptController.getLeaderboard);

module.exports = router;
