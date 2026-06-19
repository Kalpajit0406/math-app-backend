const router = require('express').Router();
const {
  saveStudentTest,
  checkTestResponse,
  getStudentTestResponse,
  getAllTestResponses,
  deleteAllTestResponsesById
} = require('../controllers/testResponseController');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

// Save a student's test response - requires authenticated student
router.route('/')
  .post(authMiddleware, saveStudentTest);

// Admin/Teacher: view all test responses
router.route('/res/all')
  .get(authMiddleware, authorizeRoles('admin', 'teacher'), getAllTestResponses);

// Admin/Teacher: get responses by student mobile
router.route('/:studentMobile')
  .get(authMiddleware, authorizeRoles('admin', 'teacher'), getStudentTestResponse);

// Admin/Teacher: check if student has submitted a test
router.route('/check/:studentMobile/:testId')
  .get(authMiddleware, authorizeRoles('admin', 'teacher'), checkTestResponse);

// Admin/Teacher: delete test responses
router.route('/delete/:testId')
  .delete(authMiddleware, authorizeRoles('admin', 'teacher'), deleteAllTestResponsesById);

module.exports = router;
