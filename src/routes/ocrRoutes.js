const router = require('express').Router();
const ocrController = require('../controllers/ocrController');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const { secureMemoryUpload } = require('../middleware/uploadMiddleware');

router.post('/scan', authMiddleware, authorizeRoles('admin', 'teacher'), secureMemoryUpload.single('image'), ocrController.scanImage);
router.post('/process', authMiddleware, authorizeRoles('admin', 'teacher'), secureMemoryUpload.single('image'), ocrController.scanImage);

module.exports = router;
