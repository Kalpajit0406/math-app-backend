const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const { validationRules } = require('../middleware/validationMiddleware');

router.post('/register', validationRules.registerValidation, authController.register);
router.post('/login', validationRules.loginValidation, authController.login);
router.get('/me', authMiddleware, authController.me);

router.get('/students', authMiddleware, authorizeRoles('admin'), authController.getAllStudents);
router.post('/accept', authMiddleware, authorizeRoles('admin'), authController.acceptStudent);
router.post('/reject', authMiddleware, authorizeRoles('admin'), authController.rejectStudent);

module.exports = router;
