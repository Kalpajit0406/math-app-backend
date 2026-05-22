const router = require('express').Router();
const ocrController = require('../controllers/ocrController');
const uploadController = require('../controllers/uploadController');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const { secureMemoryUpload, secureScanUpload } = require('../middleware/uploadMiddleware');

router.post('/', secureScanUpload.single('pdf'), uploadController.upload);
router.post('/scan', authMiddleware, authorizeRoles('admin', 'teacher'), secureMemoryUpload.single('image'), ocrController.scanImage);
router.post('/process', authMiddleware, authorizeRoles('admin', 'teacher'), secureMemoryUpload.single('image'), ocrController.scanImage);
router.get('/jobs/:jobId', authMiddleware, authorizeRoles('admin', 'teacher'), ocrController.getJobStatus);

module.exports = router;
