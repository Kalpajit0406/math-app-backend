'use strict';

const express = require('express');
const router = express.Router();
const importController = require('../controllers/importController');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const { secureScanUpload } = require('../middleware/uploadMiddleware');

// Secure all import routes to admins and teachers
router.use(authMiddleware);
router.use(authorizeRoles('admin', 'teacher'));

// Upload source for import (PDF/Image/URL/Markdown/CSV)
router.post('/upload', secureScanUpload.single('file'), importController.uploadSource);

// Retrieve all import jobs
router.get('/jobs', importController.getJobs);

// Retrieve job status
router.get('/jobs/:jobId', importController.getJobStatus);

// Retrieve job extracted items for preview
router.get('/jobs/:jobId/items', importController.getJobItems);

// Edit an individual unverified item
router.put('/items/:itemId', importController.updateItem);

// Confirm/Reject batch of items for a job
router.post('/jobs/:jobId/confirm', importController.confirmJobItems);

module.exports = router;
