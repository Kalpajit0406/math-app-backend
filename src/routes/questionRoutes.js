const express = require('express');
const router = express.Router();
const multer = require('multer');
const questionController = require('../controllers/questionController');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

const upload = multer({ 
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/temp'),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024 }
});

router.get('/questions', questionController.getQuestions);
router.post('/addQuestion', authMiddleware, authorizeRoles('admin', 'teacher'), upload.single('diagram'), questionController.addQuestion);
router.put('/update/:id', authMiddleware, authorizeRoles('admin', 'teacher'), upload.single('diagram'), questionController.updateQuestion);
router.delete('/delete/:id', authMiddleware, authorizeRoles('admin', 'teacher'), questionController.deleteQuestion);

module.exports = router;
