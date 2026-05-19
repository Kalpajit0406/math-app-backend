const express = require('express');
const router = express.Router();
const announcementController = require('../controllers/announcementController');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const { validationRules } = require('../middleware/validationMiddleware');

// Allow getting announcements without auth or with auth
router.get('/', announcementController.getAnnouncements);

// Create announcement
router.post('/admin', authMiddleware, authorizeRoles('admin'), validationRules.createAnnouncementValidation, announcementController.createAnnouncement);

module.exports = router;
