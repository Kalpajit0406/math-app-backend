const router = require('express').Router();
const {
  saveStudentTest,
  checkTestResponse,
  getStudentTestResponse,
  getAllTestResponses,
  deleteAllTestResponsesById
} = require('../controllers/testResponseController');
const authMiddleware = require('../middleware/authMiddleware');

router.route('/')
  .post(authMiddleware, saveStudentTest);

router.route('/res/all')
  .get(getAllTestResponses);

router.route('/:studentMobile')
  .get(getStudentTestResponse);

router.route('/check/:studentMobile/:testId')
  .get(checkTestResponse);

router.route('/delete/:testId')
  .delete(deleteAllTestResponsesById);

module.exports = router;
