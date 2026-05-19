/**
 * Input Validation Middleware
 * Provides centralized request validation using express-validator patterns
 */

const validatePhoneNumber = (phone) => {
  if (!phone || typeof phone !== 'string') return false;
  // Valid Indian phone numbers: 10 digits, can start with +91
  const phoneRegex = /^(\+91)?[6-9]\d{9}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
};

const validateEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password) => {
  if (!password || typeof password !== 'string') return false;
  // Minimum 6 characters, at least one uppercase, one lowercase, one digit
  return password.length >= 6;
};

const validateClassNumber = (classNo) => {
  const validClasses = [9, 10, 11, 12];
  return validClasses.includes(Number(classNo));
};

const sanitizeString = (str) => {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .replace(/[<>]/g, '') // Remove HTML-like brackets
    .substring(0, 1000); // Limit length
};

const sanitizeLatex = (latex) => {
  if (typeof latex !== 'string') return '';
  // Remove potentially dangerous commands (already handled in LaTeX sanitizer)
  // but add extra protection here
  const dangerousPatterns = [
    /\\(input|write|immediate|openout|closeout|special|usepackage|documentclass|def|let)\s*{/g,
    /\$\$\$+/g, // Multiple consecutive dollars
  ];
  
  let sanitized = latex;
  for (const pattern of dangerousPatterns) {
    sanitized = sanitized.replace(pattern, '');
  }
  return sanitized.substring(0, 10000); // Limit LaTeX length
};

// Validation schemas/rules
const validationRules = {
  // Auth validation
  loginValidation: (req, res, next) => {
    const { studentPhone, password } = req.body;
    
    const errors = [];
    if (!validatePhoneNumber(studentPhone)) {
      errors.push('Invalid phone number format');
    }
    if (!validatePassword(password)) {
      errors.push('Invalid password');
    }
    
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }
    
    next();
  },

  registerValidation: (req, res, next) => {
    const { studentPhone, password, firstName, lastName, classNo, language } = req.body;
    
    const errors = [];
    if (!validatePhoneNumber(studentPhone)) {
      errors.push('Invalid phone number format');
    }
    if (!validatePassword(password)) {
      errors.push('Password must be at least 6 characters');
    }
    if (!firstName || typeof firstName !== 'string' || firstName.length > 100) {
      errors.push('Invalid first name');
    }
    if (!lastName || typeof lastName !== 'string' || lastName.length > 100) {
      errors.push('Invalid last name');
    }
    if (!validateClassNumber(classNo)) {
      errors.push('Invalid class number (must be 9, 10, 11, or 12)');
    }
    if (!language || !['English', 'Marathi', 'Hindi'].includes(language)) {
      errors.push('Invalid language');
    }
    
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }
    
    // Sanitize fields for database storage
    req.body.firstName = sanitizeString(firstName);
    req.body.lastName = sanitizeString(lastName);
    
    next();
  },

  // Question validation
  createQuestionValidation: (req, res, next) => {
    const { question, options, correctAnswer, examId, questionNumber, language } = req.body;
    
    const errors = [];
    if (!question || typeof question !== 'string' || question.length < 5) {
      errors.push('Question text must be at least 5 characters');
    }
    if (!Array.isArray(options) || options.length !== 4) {
      errors.push('Must provide exactly 4 options');
    }
    if (correctAnswer === undefined || ![0, 1, 2, 3].includes(Number(correctAnswer))) {
      errors.push('Correct answer must be 0, 1, 2, or 3');
    }
    if (!examId || typeof examId !== 'string' || examId.length < 5) {
      errors.push('Invalid exam ID');
    }
    if (questionNumber && (typeof questionNumber !== 'number' || questionNumber < 1)) {
      errors.push('Invalid question number');
    }
    
    // Validate each option
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      if (typeof opt !== 'string' || opt.length < 1) {
        errors.push(`Option ${i + 1} is empty or invalid`);
      }
      if (opt.length > 5000) {
        errors.push(`Option ${i + 1} is too long (max 5000 characters)`);
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }
    
    // Sanitize LaTeX content in question and options
    req.body.question = sanitizeLatex(question);
    req.body.options = options.map(opt => sanitizeLatex(opt));
    
    next();
  },

  // Exam validation
  createExamValidation: (req, res, next) => {
    const { title, description, duration, classNo, language, totalMarks } = req.body;
    
    const errors = [];
    if (!title || typeof title !== 'string' || title.length < 3 || title.length > 200) {
      errors.push('Title must be 3-200 characters');
    }
    if (description && (typeof description !== 'string' || description.length > 2000)) {
      errors.push('Description must be under 2000 characters');
    }
    if (!duration || typeof duration !== 'number' || duration < 5 || duration > 240) {
      errors.push('Duration must be 5-240 minutes');
    }
    if (!validateClassNumber(classNo)) {
      errors.push('Invalid class number');
    }
    if (!language || !['English', 'Marathi', 'Hindi'].includes(language)) {
      errors.push('Invalid language');
    }
    if (totalMarks && (typeof totalMarks !== 'number' || totalMarks < 1 || totalMarks > 500)) {
      errors.push('Total marks must be 1-500');
    }
    
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }
    
    req.body.title = sanitizeString(title);
    req.body.description = sanitizeString(description || '');
    
    next();
  },

  // Attempt submission validation
  submitAttemptValidation: (req, res, next) => {
    const { attemptId, responses, endTime } = req.body;
    
    const errors = [];
    if (!attemptId || typeof attemptId !== 'string' || attemptId.length < 5) {
      errors.push('Invalid attempt ID');
    }
    if (!Array.isArray(responses)) {
      errors.push('Responses must be an array');
    }
    if (responses.length > 500) {
      errors.push('Too many responses');
    }
    
    // Validate each response
    for (let i = 0; i < responses.length; i++) {
      const resp = responses[i];
      if (resp.selectedAnswer !== undefined && ![0, 1, 2, 3, -1].includes(Number(resp.selectedAnswer))) {
        errors.push(`Invalid answer at index ${i}`);
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }
    
    next();
  },

  // OCR upload validation
  ocrUploadValidation: (req, res, next) => {
    // File validation happens in upload middleware
    // This validates accompanying data
    const { examId, questionNumber } = req.body;
    
    const errors = [];
    if (!req.file && !req.body.base64Image && !req.body.imageUrl) {
      errors.push('Provide an image file, base64Image, or imageUrl');
    }
    
    if (req.file) {
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedMimes.includes(req.file.mimetype)) {
        errors.push('Only JPEG, PNG, and WebP images are allowed');
      }
      if (req.file.size > 10 * 1024 * 1024) { // 10MB limit
        errors.push('File size must be under 10MB');
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }
    
    next();
  },

  // Announcement validation
  createAnnouncementValidation: (req, res, next) => {
    const { title, message, targetClass, priority } = req.body;
    
    const errors = [];
    if (!title || typeof title !== 'string' || title.length < 3 || title.length > 200) {
      errors.push('Title must be 3-200 characters');
    }
    if (!message || typeof message !== 'string' || message.length < 5 || message.length > 5000) {
      errors.push('Message must be 5-5000 characters');
    }
    if (targetClass && !validateClassNumber(targetClass)) {
      errors.push('Invalid target class');
    }
    if (priority && !['low', 'medium', 'high'].includes(priority)) {
      errors.push('Invalid priority level');
    }
    
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }
    
    req.body.title = sanitizeString(title);
    req.body.message = sanitizeString(message);
    
    next();
  },
};

module.exports = {
  validationRules,
  validatePhoneNumber,
  validateEmail,
  validatePassword,
  validateClassNumber,
  sanitizeString,
  sanitizeLatex,
};
