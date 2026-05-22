const express = require('express');
const router = express.Router();
const attemptController = require('../controllers/attemptController');
const testResponseController = require('../controllers/testResponseController');
const authMiddleware = require('../middleware/authMiddleware');
const { validationRules } = require('../middleware/validationMiddleware');

// Attempt routes (Flutter)
router.post('/start', authMiddleware, attemptController.startAttempt);
router.post('/submit', authMiddleware, validationRules.submitAttemptValidation, attemptController.submitAttempt);
router.post('/sync-offline', authMiddleware, validationRules.syncOfflineAttemptValidation, attemptController.syncOfflineAttempt);
router.get('/result/:id', authMiddleware, attemptController.getResult);
router.get('/leaderboard/:examId', authMiddleware, attemptController.getLeaderboard);

// TestResponse routes (Web)
router.post('/', authMiddleware, testResponseController.saveStudentTest);
router.get('/res/all', authMiddleware, testResponseController.getAllTestResponses);
router.get('/check/:studentMobile/:testId', testResponseController.checkTestResponse);
router.delete('/delete/:testId', authMiddleware, testResponseController.deleteAllTestResponsesById);
router.get('/:studentMobile', testResponseController.getStudentTestResponse);

module.exports = router;
