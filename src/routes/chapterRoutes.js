const express = require('express');
const router = express.Router();
const chapterController = require('../controllers/chapterController');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const { validationRules } = require('../middleware/validationMiddleware');

// Get all chapters (or filtered by classId)
router.get('/', authMiddleware, chapterController.getChapters);

// Get lightweight chapter synchronization version
router.get('/version', authMiddleware, chapterController.getSyncVersion);

// Get question count / usage for a chapter
router.get('/:id/usage', authMiddleware, authorizeRoles('admin', 'teacher'), chapterController.getChapterUsage);

// Add a new chapter
router.post('/add', authMiddleware, authorizeRoles('admin', 'teacher'), validationRules.createChapterValidation, chapterController.addChapter);

// Edit/rename or destructive edit of a chapter
router.put('/edit/:id', authMiddleware, authorizeRoles('admin', 'teacher'), validationRules.editChapterValidation, chapterController.editChapter);

// Cascade delete a chapter
router.delete('/delete/:id', authMiddleware, authorizeRoles('admin', 'teacher'), chapterController.deleteChapter);

module.exports = router;
