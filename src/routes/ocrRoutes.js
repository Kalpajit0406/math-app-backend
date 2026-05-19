const router = require('express').Router();
const multer = require('multer');
const ocrController = require('../controllers/ocrController');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

router.post('/scan', authMiddleware, authorizeRoles('admin', 'teacher'), upload.single('image'), ocrController.scanImage);
router.post('/process', authMiddleware, authorizeRoles('admin', 'teacher'), upload.single('image'), ocrController.scanImage);

module.exports = router;
