const express = require('express');
const router = express.Router();
const examController = require('../controllers/examController');
const testConfigController = require('../controllers/testConfigController');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const { validationRules } = require('../middleware/validationMiddleware');

// Dispatcher for GET / to handle both Flutter and Web clients
const getExamsOrTests = (req, res, next) => {
  const userAgent = req.headers['user-agent'] || '';
  const authHeader = req.headers['authorization'];
  
  if (userAgent.includes('Dart') || authHeader) {
    return authMiddleware(req, res, () => {
      examController.getExams(req, res, next);
    });
  } else {
    return testConfigController.getAllStudentTests(req, res, next);
  }
};

// Exam routes (Flutter)
router.post('/create', authMiddleware, authorizeRoles('admin', 'teacher'), validationRules.createExamValidation, examController.createExam);
router.get('/:id', authMiddleware, examController.getExamById);

// TestConfig routes (Web)
router.post('/', testConfigController.createTestConfig);
router.get('/:classNo/:language', testConfigController.getTestsByClassAndLanguage);
router.delete('/delete/:id', testConfigController.deleteTestConfig);

// Dynamic root GET route
router.get('/', getExamsOrTests);

module.exports = router;
