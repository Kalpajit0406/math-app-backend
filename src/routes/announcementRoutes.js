const express = require('express');
const router = express.Router();
const announcementController = require('../controllers/announcementController');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const { validationRules } = require('../middleware/validationMiddleware');
const { checkPermission } = require('../middleware/permissionMiddleware');

router.post('/create', authMiddleware, authorizeRoles('admin', 'teacher'), validationRules.createAnnouncementValidation, announcementController.createAnnouncement);
router.get('/', authMiddleware, checkPermission('canReceiveNotifications'), announcementController.getAnnouncements);

// Create announcement
router.post('/admin', authMiddleware, authorizeRoles('admin', 'teacher'), validationRules.createAnnouncementValidation, announcementController.createAnnouncement);

// Bulk delete announcements
router.post('/bulk-delete', authMiddleware, authorizeRoles('admin', 'teacher'), announcementController.bulkDeleteAnnouncements);

module.exports = router;
