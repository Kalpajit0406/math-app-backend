const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', authMiddleware, authController.me);

router.get('/students', authMiddleware, authorizeRoles('admin'), authController.getAllStudents);
router.post('/accept', authMiddleware, authorizeRoles('admin'), authController.acceptStudent);
router.post('/reject', authMiddleware, authorizeRoles('admin'), authController.rejectStudent);

module.exports = router;
