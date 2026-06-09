const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const { validationRules } = require('../middleware/validationMiddleware');

const createRateLimiter = require('../middleware/rateLimitMiddleware');

const registerLimiter = createRateLimiter('register', 5, 600, 'Too many registration attempts. Please try again in 10 minutes.');
const loginLimiter = createRateLimiter('login', 10, 300, 'Too many login attempts. Please try again in 5 minutes.');

router.post('/register', registerLimiter, validationRules.registerValidation, authController.register);
router.post('/login', loginLimiter, validationRules.loginValidation, authController.login);
router.post('/refresh-token', authController.refreshSession);
router.post('/logout', authController.logout);
router.post('/logout-all', authMiddleware, authController.logoutAll);
router.get('/me', authMiddleware, authController.me);
router.post('/profile-edit-request', authMiddleware, authController.submitProfileEditRequest);
router.get('/pending-profile-edits', authMiddleware, authorizeRoles('admin', 'teacher'), authController.getPendingProfileEdits);
router.post('/approve-profile-edit', authMiddleware, authorizeRoles('admin', 'teacher'), authController.approveProfileEdit);

router.get('/students', authMiddleware, authorizeRoles('admin', 'teacher'), authController.getAllStudents);
router.post('/accept', authMiddleware, authorizeRoles('admin', 'teacher'), authController.acceptStudent);
router.post('/reject', authMiddleware, authorizeRoles('admin', 'teacher'), authController.rejectStudent);
router.post('/blacklist', authMiddleware, authorizeRoles('admin', 'teacher'), authController.blacklistStudent);
router.post('/update-account-status', authMiddleware, authorizeRoles('admin', 'teacher'), authController.updateAccountStatus);
router.post('/bulk-accept', authMiddleware, authorizeRoles('admin', 'teacher'), authController.bulkAcceptStudents);
router.post('/bulk-reject', authMiddleware, authorizeRoles('admin', 'teacher'), authController.bulkRejectStudents);
router.post('/bulk-delete', authMiddleware, authorizeRoles('admin', 'teacher'), authController.bulkDeleteStudents);

// Public endpoint — no auth required, used by the app before registration
router.get('/phone-status/:phone', authController.getPhoneStatus);

module.exports = router;
