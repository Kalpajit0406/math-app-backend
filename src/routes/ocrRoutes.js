const router = require('express').Router();
const ocrController = require('../controllers/ocrController');
const uploadController = require('../controllers/uploadController');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const { secureMemoryUpload, secureDiskUpload, secureScanUpload } = require('../middleware/uploadMiddleware');

const createRateLimiter = require('../middleware/rateLimitMiddleware');
const ocrLimiter = createRateLimiter('ocr_upload', 15, 300, 'Too many OCR uploads. Please try again in 5 minutes.');

router.post('/', secureScanUpload.single('pdf'), uploadController.upload);
router.post('/scan', authMiddleware, authorizeRoles('admin', 'teacher'), ocrLimiter, secureDiskUpload.single('image'), ocrController.scanImage);
router.post('/process', authMiddleware, authorizeRoles('admin', 'teacher'), ocrLimiter, secureDiskUpload.single('image'), ocrController.scanImage);
router.get('/jobs/:jobId', authMiddleware, authorizeRoles('admin', 'teacher'), ocrController.getJobStatus);

module.exports = router;
