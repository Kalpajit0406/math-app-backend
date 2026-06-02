/**
 * Performance Analytics Controller
 * Endpoints for student and class performance data
 */

const PerformanceAnalytics = require('../services/performanceAnalyticsService');

// Get individual student performance data
exports.getStudentPerformance = async (req, res) => {
  try {
    const { studentId } = req.params;
    const userId = req.user?.id;

    // Students can only see their own data, teachers/admins can see any student
    if (req.user?.role === 'student' && userId !== studentId) {
      return res.status(403).json({
        success: false,
        message: 'You can only view your own performance data'
      });
    }

    const performance = await PerformanceAnalytics.getStudentPerformance(studentId);

    res.json({
      success: true,
      data: performance
    });
  } catch (error) {
    console.error('Get student performance error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get class performance (for teachers/admins)
exports.getClassPerformance = async (req, res) => {
  try {
    const { classNo } = req.params;
    const { language } = req.query;

    // Check authorization
    const userRole = req.user?.role;
    if (!['admin', 'teacher'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Only teachers and admins can view class performance'
      });
    }

    const performance = await PerformanceAnalytics.getClassPerformance(
      parseInt(classNo),
      language
    );

    res.json({
      success: true,
      data: performance
    });
  } catch (error) {
    console.error('Get class performance error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get my performance (logged-in student)
exports.getMyPerformance = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { timeframe } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const performance = await PerformanceAnalytics.getStudentPerformance(userId, timeframe);

    res.json({
      success: true,
      data: performance
    });
  } catch (error) {
    console.error('Get my performance error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = exports;
