const express = require('express');
const router = express.Router();
const attemptController = require('../controllers/attemptController');
const testResponseController = require('../controllers/testResponseController');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const { validationRules } = require('../middleware/validationMiddleware');
const { checkPermission } = require('../middleware/permissionMiddleware');

// Attempt routes (Flutter)
router.post('/start', authMiddleware, checkPermission('canAccessTeacherExams'), attemptController.startAttempt);
router.post('/submit', authMiddleware, checkPermission('canAccessTeacherExams'), validationRules.submitAttemptValidation, attemptController.submitAttempt);
router.post('/sync-offline', authMiddleware, checkPermission('canAccessTeacherExams'), validationRules.syncOfflineAttemptValidation, attemptController.syncOfflineAttempt);
router.get('/result/:id', authMiddleware, checkPermission('canAccessTeacherExams'), attemptController.getResult);
router.get('/leaderboard/:examId', authMiddleware, checkPermission('canAccessLeaderboard'), attemptController.getLeaderboard);
router.get('/completed-exam-ids', authMiddleware, checkPermission('canAccessTeacherExams'), attemptController.getCompletedExamIds);
router.get('/completed-attempts', authMiddleware, checkPermission('canAccessTeacherExams'), attemptController.getCompletedAttempts);

// TestResponse routes (Web)
router.post('/', authMiddleware, testResponseController.saveStudentTest);
router.get('/res/all', authMiddleware, testResponseController.getAllTestResponses);
router.get('/check/:studentMobile/:testId', authMiddleware, authorizeRoles('admin', 'teacher'), testResponseController.checkTestResponse);
router.delete('/delete/:testId', authMiddleware, authorizeRoles('admin', 'teacher'), testResponseController.deleteAllTestResponsesById);
router.get('/:studentMobile', authMiddleware, authorizeRoles('admin', 'teacher'), testResponseController.getStudentTestResponse);

module.exports = router;
