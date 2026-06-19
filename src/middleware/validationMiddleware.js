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

const isTeacherBypassEnabled = () => {
  const flag = String(process.env.ALLOW_TEACHER_BYPASS || '').toLowerCase();
  return flag === 'true' || flag === '1' || flag === 'yes';
};

const getTeacherBypassPhone = () => process.env.TEACHER_BYPASS_PHONE || '';

const validateClassNumber = (classNo) => {
  if (classNo === 'all' || classNo === 'All') return true;
  const validClasses = [9, 10, 11, 12, 13];
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
    const teacherBypassPhone = getTeacherBypassPhone();
    const teacherBypassAllowed = isTeacherBypassEnabled() && studentPhone === teacherBypassPhone;
    
    const errors = [];
    if (!validatePhoneNumber(studentPhone)) {
      errors.push('Invalid phone number format');
    }
    if (!teacherBypassAllowed && !validatePassword(password)) {
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
    const validStudentClasses = [9, 10, 11, 12];
    if (!validStudentClasses.includes(Number(classNo))) {
      errors.push('Invalid class number (must be 9, 10, 11, or 12)');
    }
    if (req.body.accountType === 'TRIAL' && ![11, 12].includes(Number(classNo))) {
      errors.push('Free-tier/Trial registration is only allowed for Class 11 and Class 12');
    }
    if (req.body.isJoint && ![11, 12].includes(Number(classNo))) {
      errors.push('Joint Entrance is only available for classes 11 and 12');
    }
    if (!language || !['English', 'Bengali', 'Both'].includes(language)) {
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
    // Parse options if it's sent as a JSON string (due to multipart/form-data upload)
    if (typeof req.body.options === 'string') {
      try {
        req.body.options = JSON.parse(req.body.options);
      } catch (e) {
        // Will fail options array check below
      }
    }

    const { question, options, correctAnswer, language, classNo, chapter } = req.body;
    const normalizedLanguage = typeof language === 'string'
      ? language.trim().charAt(0).toUpperCase() + language.trim().slice(1).toLowerCase()
      : '';
    
    const errors = [];
    if (!question || typeof question !== 'string' || question.trim().length < 2) {
      errors.push('Question text must be at least 2 characters');
    }
    if (!Array.isArray(options) || options.length !== 4) {
      errors.push('Must provide exactly 4 options');
    } else {
      // Validate each option
      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        if (typeof opt !== 'string' || opt.trim().length < 1) {
          errors.push(`Option ${i + 1} is empty or invalid`);
        } else if (opt.length > 5000) {
          errors.push(`Option ${i + 1} is too long (max 5000 characters)`);
        }
      }
    }
    
    if (correctAnswer === undefined || String(correctAnswer).trim() === '') {
      errors.push('Correct answer is required');
    }
    
    if (!normalizedLanguage || !['Bengali', 'English', 'Both'].includes(normalizedLanguage)) {
      errors.push(`Invalid language: ${normalizedLanguage || language}`);
    }
    
    const clsNum = Number(classNo);
    if (!classNo || ![9, 10, 11, 12, 13].includes(clsNum)) {
      errors.push('Invalid class number (must be 9, 10, 11, 12, or 13)');
    }
    
    if (clsNum === 13) {
      if (!['11', '12', 'Joint'].includes(chapter)) {
        errors.push('Invalid chapter for Joint Entrance (must be 11, 12, or Joint)');
      }
    } else {
      if (!chapter || typeof chapter !== 'string' || chapter.trim() === '') {
        errors.push('Chapter is required');
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }
    
    // Sanitize LaTeX content in question and options
    req.body.question = sanitizeLatex(question);
    req.body.options = options.map(opt => sanitizeLatex(opt));
    req.body.language = normalizedLanguage;
    
    next();
  },

  // Exam validation
  createExamValidation: (req, res, next) => {
    const isSchedulePayload = req.path === '/';
    
    if (isSchedulePayload) {
      req.body.title = req.body.title || `Class ${req.body.classNo} ${req.body.language} Test`;
      
      const totalMarks = Number(req.body.totalMarks || 0);
      const marksPQ = Number(req.body.marksPQ !== undefined ? req.body.marksPQ : 1.0);
      const timePQ = Number(req.body.timePQ || 0); // timePQ in seconds
      
      const calculatedQuestions = marksPQ > 0 ? (totalMarks / marksPQ) : 0;
      const calculatedDurationSeconds = calculatedQuestions * timePQ;
      const calculatedDurationMinutes = Math.ceil(calculatedDurationSeconds / 60);

      req.body.duration = Number(req.body.duration || calculatedDurationMinutes || 0);
      req.body.totalTime = req.body.duration;
      req.body.totalQuestions = Number(req.body.totalQuestions || calculatedQuestions || 0);
      req.body.negativeMarking = Number(req.body.negativeMarking !== undefined ? req.body.negativeMarking : (req.body.negativeMarksPQ || 0.0));
      req.body.marksPerQuestion = Number(req.body.marksPerQuestion !== undefined ? req.body.marksPerQuestion : marksPQ);
      req.body.chapters = Array.isArray(req.body.chapters) ? req.body.chapters : [];
      if (!req.body.questions) {
        req.body.questions = [];
      }
    }

    const rawDuration = req.body.duration !== undefined ? req.body.duration : req.body.totalTime;
    const duration = rawDuration !== undefined ? Number(rawDuration) : undefined;
    const title = req.body.title || `Class ${req.body.classNo} ${req.body.language} Test`;
    const { description, classNo, language, totalMarks, questions, date, time } = req.body;
    
    const errors = [];
    if (!title || typeof title !== 'string' || title.length < 3 || title.length > 200) {
      errors.push('Title must be 3-200 characters');
    }
    if (description && (typeof description !== 'string' || description.length > 2000)) {
      errors.push('Description must be under 2000 characters');
    }
    if (duration === undefined || isNaN(duration) || duration <= 0) {
      errors.push('Duration must be greater than 0 minutes');
    }
    if (!validateClassNumber(classNo)) {
      errors.push('Invalid class number');
    }
    if (!language || !['English', 'Bengali', 'Both'].includes(language)) {
      errors.push('Invalid language');
    }
    if (totalMarks && (typeof totalMarks !== 'number' || totalMarks < 1 || totalMarks > 500)) {
      errors.push('Total marks must be 1-500');
    }
    
    // Validate questions array
    const isRandomSampleed = !!(classNo && language && date && time);
    if (Array.isArray(questions) && questions.length > 0) {
      const seenQuestions = new Set();
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q) {
          errors.push(`Question at index ${i} is empty`);
          continue;
        }
        
        const qText = (q.questionText || q.question || '').trim();
        if (!qText) {
          errors.push(`Question at index ${i} must have question text`);
        } else {
          if (seenQuestions.has(qText.toLowerCase())) {
            errors.push(`Duplicate question detected at index ${i}`);
          }
          seenQuestions.add(qText.toLowerCase());
        }

        const qType = q.type || ((q.options && q.options.length > 0) ? 'mcq' : 'numeric');
        if (!['mcq', 'numeric'].includes(qType)) {
          errors.push(`Question at index ${i} must have a valid type (mcq or numeric)`);
        }

        if (qType === 'mcq') {
          if (!Array.isArray(q.options) || q.options.length !== 4) {
            errors.push(`MCQ question at index ${i} must have exactly 4 options`);
          } else {
            for (let j = 0; j < 4; j++) {
              if (typeof q.options[j] !== 'string' || q.options[j].trim() === '') {
                errors.push(`MCQ question at index ${i} has empty option at choice ${j + 1}`);
              }
            }
          }
          if (!q.correctAnswer || !['A', 'B', 'C', 'D'].includes(String(q.correctAnswer).trim().toUpperCase())) {
            errors.push(`MCQ question at index ${i} must have correct answer of A, B, C, or D`);
          }
        } else if (qType === 'numeric') {
          if (q.correctAnswer === undefined || String(q.correctAnswer).trim() === '') {
            errors.push(`Numeric question at index ${i} must have a correct answer`);
          }
        }
      }
    } else {
      if (!isSchedulePayload && !isRandomSampleed) {
        errors.push('Exam must contain at least one question');
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }
    
    req.body.duration = duration;
    req.body.title = sanitizeString(title);
    req.body.description = sanitizeString(description || '');
    if (Array.isArray(questions)) {
      req.body.questions = questions.map(q => {
        const qText = (q.questionText || q.question || '');
        const opts = Array.isArray(q.options) ? q.options.map(opt => sanitizeLatex(opt)) : [];
        const qType = q.type || ((q.options && q.options.length > 0) ? 'mcq' : 'numeric');
        return {
          type: qType,
          questionText: sanitizeLatex(qText),
          options: opts,
          correctAnswer: String(q.correctAnswer).trim()
        };
      });
    }
    
    next();
  },

  // Attempt submission validation
  submitAttemptValidation: (req, res, next) => {
    const { attemptId, responses } = req.body;
    
    const errors = [];
    if (!attemptId || typeof attemptId !== 'string' || attemptId.length < 5) {
      errors.push('Invalid attempt ID');
    }
    if (!Array.isArray(responses)) {
      errors.push('Responses must be an array');
    } else {
      if (responses.length > 500) {
        errors.push('Too many responses');
      }
      
      // Validate each response
      for (let i = 0; i < responses.length; i++) {
        const resp = responses[i];
        if (!resp || !resp.questionId || typeof resp.questionId !== 'string') {
          errors.push(`Missing or invalid questionId at index ${i}`);
        }
        const answer = resp.userAnswer !== undefined ? resp.userAnswer : resp.selectedAnswer;
        if (answer === undefined) {
          errors.push(`Missing answer value at index ${i}`);
        }
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }
    
    next();
  },

  // Sync offline attempt validation
  syncOfflineAttemptValidation: (req, res, next) => {
    const { examId, responses } = req.body;
    
    const errors = [];
    if (!examId || typeof examId !== 'string' || examId.length < 5) {
      errors.push('Invalid exam ID');
    }
    if (!Array.isArray(responses)) {
      errors.push('Responses must be an array');
    } else {
      if (responses.length > 500) {
        errors.push('Too many responses');
      }
      
      // Validate each response
      for (let i = 0; i < responses.length; i++) {
        const resp = responses[i];
        if (!resp || !resp.questionId || typeof resp.questionId !== 'string') {
          errors.push(`Missing or invalid questionId at index ${i}`);
        }
        const answer = resp.selectedAnswer !== undefined ? resp.selectedAnswer : resp.userAnswer;
        if (answer === undefined) {
          errors.push(`Missing answer value at index ${i}`);
        }
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
      if (req.file.size > 100 * 1024 * 1024) { // 100MB limit
        errors.push('File size must be under 100MB');
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }
    
    next();
  },

  // Announcement validation
  createAnnouncementValidation: (req, res, next) => {
    const { title, message, targetClass, targetClassIds, priority } = req.body;
    
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
    if (targetClassIds !== undefined) {
      if (!Array.isArray(targetClassIds)) {
        errors.push('targetClassIds must be an array of numbers');
      } else {
        for (const classId of targetClassIds) {
          if (!validateClassNumber(classId)) {
            errors.push(`Invalid class ID in targetClassIds: ${classId}`);
          }
        }
      }
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

  // Chapter validation
  createChapterValidation: (req, res, next) => {
    const { classId, chapterName, parentChapter } = req.body;
    const errors = [];
    
    if (!classId || (typeof classId !== 'string' && typeof classId !== 'number')) {
      errors.push('Invalid or missing classId');
    }
    
    if (!chapterName || typeof chapterName !== 'string' || chapterName.trim().length < 1 || chapterName.length > 200) {
      errors.push('Chapter name is required and must be under 200 characters');
    }
    
    if (parentChapter !== undefined && (typeof parentChapter !== 'string' || !['11', '12', 'JEE'].includes(parentChapter))) {
      errors.push('parentChapter must be "11", "12", or "JEE"');
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }
    
    req.body.chapterName = sanitizeString(chapterName);
    if (typeof classId === 'string') {
      req.body.classId = classId.trim();
    }
    if (parentChapter) {
      req.body.parentChapter = parentChapter.trim();
    }
    
    next();
  },

  editChapterValidation: (req, res, next) => {
    const { chapterName, action } = req.body;
    const errors = [];
    
    if (!action || !['rename', 'delete_questions'].includes(action)) {
      errors.push("Valid action ('rename' or 'delete_questions') is required");
    }
    
    if (action === 'rename') {
      if (!chapterName || typeof chapterName !== 'string' || chapterName.trim().length < 1 || chapterName.length > 200) {
        errors.push('chapterName is required and must be under 200 characters for renaming');
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }
    
    if (chapterName) {
      req.body.chapterName = sanitizeString(chapterName);
    }
    
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
