const router = require('express').Router();
const {
  createTestConfig,
  getAllStudentTests,
  getTestsByClassAndLanguage,
  deleteTestConfig
} = require('../controllers/testConfigController');

router.route('/')
  .post(createTestConfig)
  .get(getAllStudentTests);

router.route('/:classNo/:language')
  .get(getTestsByClassAndLanguage);

router.route('/delete/:id')
  .delete(deleteTestConfig);

module.exports = router;
