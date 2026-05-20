const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const authMiddleware = require('../middleware/authMiddleware');

// All analytics endpoints require authentication
router.use(authMiddleware);

// Get my own performance data
router.get('/my-performance', analyticsController.getMyPerformance);

// Get specific student performance (admin/teacher only for other students)
router.get('/student/:studentId', analyticsController.getStudentPerformance);

// Get class performance (admin/teacher only)
router.get('/class/:classNo', analyticsController.getClassPerformance);

module.exports = router;
