const express = require('express');
const router = express.Router();
const examController = require('../controllers/examController');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

router.post('/create', authMiddleware, authorizeRoles('admin', 'teacher'), examController.createExam);
router.get('/', examController.getExams);
router.get('/:id', examController.getExamById);

module.exports = router;
