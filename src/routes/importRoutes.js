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

// --- NEW CLEAN REST API (Relative to /api/v1/imports) ---
// Create and queue import job
router.post('/', secureScanUpload.single('file'), importController.createImport);
// List all import jobs
router.get('/', importController.getJobs);
// Get job status
router.get('/:id', importController.getJobStatus);
// Get job items
router.get('/:id/items', importController.getJobItems);
// Update/edit item
router.patch('/item/:id', importController.updateItem);
// Approve individual item
router.post('/item/:id/approve', importController.approveItem);
// Reject individual item
router.post('/item/:id/reject', importController.rejectItem);
// Batch save/confirm items
router.post('/:id/save', importController.confirmJobItems);
// Delete job
router.delete('/:id', importController.deleteJob);

// --- LEGACY ENDPOINTS (For backward compatibility, e.g. /api/v1/import) ---
router.post('/upload', secureScanUpload.single('file'), importController.createImport);
router.get('/jobs', importController.getJobs);
router.get('/jobs/:jobId', importController.getJobStatus);
router.get('/jobs/:jobId/items', importController.getJobItems);
router.put('/items/:itemId', importController.updateItem);
router.post('/jobs/:jobId/confirm', importController.confirmJobItems);

module.exports = router;
