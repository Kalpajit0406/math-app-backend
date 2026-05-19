require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const connectDB = require('./config/db');

// Import routes
const authRoutes = require('./routes/authRoutes');
const examRoutes = require('./routes/examRoutes');
const attemptRoutes = require('./routes/attemptRoutes');
const announcementRoutes = require('./routes/announcementRoutes');
const ocrRoutes = require('./routes/ocrRoutes');

const app = express();

// Set secure HTTP headers
app.use(helmet());

// Rate Limiting: General API limiter to prevent abuse (e.g. max 200 requests per 15 mins)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { success: false, message: 'Too many requests from this IP, please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Tight Rate Limiting for Auth & OCR to prevent brute force and Mathpix key depletion
const authOcrLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50, // 50 requests per 15 mins
  message: { success: false, message: 'High load detected from this IP on secure channels. Locked for 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);
app.use('/api/v1/student/login', authOcrLimiter);
app.use('/api/v1/admin/ocr', authOcrLimiter);
app.use('/api/v1/scan', authOcrLimiter);

// Configure CORS securely
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['*'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy'));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Data sanitization against XSS (Cross Site Scripting)
app.use(xss());

const questionRoutes = require('./routes/questionRoutes');

// Mount routes at /api/v1 to match frontend AppConstants
app.use('/api/v1/student', authRoutes);
app.use('/api/v1/tests', examRoutes);
app.use('/api/v1/testResponse', attemptRoutes);
app.use('/api/v1/announcements', announcementRoutes);
app.use('/api/v1/question', questionRoutes);
app.use('/api/v1/admin/ocr', ocrRoutes);
app.use('/api/v1/scan', ocrRoutes); // Backward compatibility for legacy frontend constants

// Additional fallback for old API compatibility if needed
// app.use('/auth', authRoutes);
// app.use('/exams', examRoutes);
// app.use('/attempt', attemptRoutes);

const PORT = process.env.PORT || 3000;

connectDB()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  });
