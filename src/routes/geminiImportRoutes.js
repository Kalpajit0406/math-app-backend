'use strict';

const express = require('express');
const router = express.Router();
const geminiImportController = require('../controllers/geminiImportController');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const { secureScanUpload } = require('../middleware/uploadMiddleware');
const createRateLimiter = require('../middleware/rateLimitMiddleware');

// Group under authorized admin/teacher roles
router.use(authMiddleware);
router.use(authorizeRoles('admin', 'teacher'));

const geminiLimiter = createRateLimiter('gemini_upload', 15, 300, 'Too many uploads. Please try again in 5 minutes.');

// Gemini question import endpoints
router.post('/import', geminiLimiter, secureScanUpload.single('file'), geminiImportController.createImport);
router.get('/status/:id', geminiImportController.getJobStatus);
router.get('/status/:id/items', geminiImportController.getJobItems);
router.post('/confirm', geminiImportController.confirmImport);

module.exports = router;
