const Student = require('../models/studentModel');

const ACCOUNT_PERMISSIONS = {
  TRIAL: {
    canGeneratePractice: true,
    canAccessTeacherExams: false,
    canReceiveNotifications: false,
    canViewPremiumAnalytics: false,
    canAccessLeaderboard: false
  },
  NORMAL: {
    canGeneratePractice: true,
    canAccessTeacherExams: true,
    canReceiveNotifications: true,
    canViewPremiumAnalytics: true,
    canAccessLeaderboard: true
  },
  PREMIUM: {
    canGeneratePractice: true,
    canAccessTeacherExams: true,
    canReceiveNotifications: true,
    canViewPremiumAnalytics: true,
    canAccessLeaderboard: true
  },
  JOINT_ENTRANCE: {
    canGeneratePractice: true,
    canAccessTeacherExams: true,
    canReceiveNotifications: true,
    canViewPremiumAnalytics: true,
    canAccessLeaderboard: true
  },
  BLOCKED: {
    canGeneratePractice: false,
    canAccessTeacherExams: false,
    canReceiveNotifications: false,
    canViewPremiumAnalytics: false,
    canAccessLeaderboard: false
  }
};

const getPermissionsForAccount = (accountType) => {
  return ACCOUNT_PERMISSIONS[accountType] || ACCOUNT_PERMISSIONS.NORMAL;
};

const checkPermission = (permissionName) => {
  return async (req, res, next) => {
    // Admins and teachers bypass all student permissions
    if (req.user && ['admin', 'teacher'].includes(req.user.role)) {
      return next();
    }

    try {
      const student = await Student.findById(req.user.id).select('accountType accountStatus permissions');
      if (!student) {
        return res.status(404).json({ success: false, message: 'Student profile not found.' });
      }

      if (student.accountStatus === 'SUSPENDED' || student.accountType === 'BLOCKED') {
        return res.status(403).json({ success: false, code: 'ACCOUNT_BLOCKED', message: 'Your account is blocked. Please contact Soumen Sir.' });
      }

      if (student.accountStatus === 'PENDING') {
        return res.status(403).json({ success: false, code: 'ACCOUNT_PENDING', message: 'Wait until your request gets approved or contact Soumen Sir.' });
      }

      if (student.accountStatus === 'REJECTED') {
        return res.status(403).json({ success: false, code: 'ACCOUNT_REJECTED', message: 'Your request was rejected. Please contact Soumen Sir.' });
      }

      // Check centralized permission engine
      const hasPermission = student.permissions && (
        student.permissions[permissionName] === true ||
        student.permissions[permissionName.replace('Teacher', '')] === true
      );

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          code: 'PERMISSION_DENIED',
          message: 'Access Denied: This feature is restricted for your account type. Contact Soumen Sir to upgrade.'
        });
      }

      req.studentAccount = student;
      next();
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  };
};

module.exports = {
  checkPermission,
  getPermissionsForAccount
};
