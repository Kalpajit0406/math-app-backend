const express = require('express');
const router = express.Router();
const questionController = require('../controllers/questionController');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const { secureDiskUpload } = require('../middleware/uploadMiddleware');

router.get('/questions', questionController.getQuestions);
router.post('/addQuestion', authMiddleware, authorizeRoles('admin', 'teacher'), secureDiskUpload.single('diagram'), questionController.addQuestion);
router.put('/update/:id', authMiddleware, authorizeRoles('admin', 'teacher'), secureDiskUpload.single('diagram'), questionController.updateQuestion);
router.delete('/delete/:id', authMiddleware, authorizeRoles('admin', 'teacher'), questionController.deleteQuestion);

module.exports = router;
