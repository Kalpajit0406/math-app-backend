const router = require('express').Router();
const ocrSessionController = require('../controllers/ocrSessionController');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const { secureMemoryUpload, secureDiskUpload } = require('../middleware/uploadMiddleware');

// Group under authorized admin/teacher roles
router.use(authMiddleware);
router.use(authorizeRoles('admin', 'teacher'));

// OCR verification session endpoints
router.post('/start', secureMemoryUpload.single('image'), ocrSessionController.startSession);
router.get('/:sessionId', ocrSessionController.getSession);
router.put('/:sessionId/item/:index', ocrSessionController.updateItem);
router.delete('/:sessionId/item/:index', ocrSessionController.deleteItem);
router.post('/:sessionId/item/:index/verify', secureDiskUpload.single('diagram'), ocrSessionController.verifyItem);
router.post('/:sessionId/index', ocrSessionController.setCurrentIndex);
router.post('/:sessionId/next', ocrSessionController.nextItem);
router.post('/:sessionId/prev', ocrSessionController.prevItem);

module.exports = router;
