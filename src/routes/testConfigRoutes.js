const router = require('express').Router();
const {
  createTestConfig,
  getAllStudentTests,
  getTestsByClassAndLanguage,
  deleteTestConfig
} = require('../controllers/testConfigController');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

// All test config management requires admin/teacher authentication
router.route('/')
  .post(authMiddleware, authorizeRoles('admin', 'teacher'), createTestConfig)
  .get(authMiddleware, authorizeRoles('admin', 'teacher'), getAllStudentTests);

router.route('/:classNo/:language')
  .get(authMiddleware, getTestsByClassAndLanguage);

router.route('/delete/:id')
  .delete(authMiddleware, authorizeRoles('admin', 'teacher'), deleteTestConfig);

module.exports = router;
