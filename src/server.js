require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
// Mongo sanitization is handled via custom middleware below
// XSS sanitization is handled via custom middleware below
const connectDB = require('./config/db');

// Import routes
const authRoutes = require('./routes/authRoutes');
const examRoutes = require('./routes/examRoutes');
const attemptRoutes = require('./routes/attemptRoutes');
const announcementRoutes = require('./routes/announcementRoutes');
const ocrRoutes = require('./routes/ocrRoutes');
const pdfRoutes = require('./routes/pdfRoutes');
const ratingRoutes = require('./routes/ratingRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const healthRoutes = require('./routes/healthRoutes');

const app = express();

// Request logger middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body));
  }
  const originalJson = res.json;
  res.json = function (data) {
    console.log(`[Response] ${res.statusCode} :`, JSON.stringify(data));
    return originalJson.call(this, data);
  };
  next();
});

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
app.use('/api/v1/pdf', authOcrLimiter); // Rate limit PDF processing

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

// Data sanitization against NoSQL query injection (Express 5 compatible)
app.use((req, res, next) => {
  const sanitize = (target) => {
    if (target && typeof target === 'object') {
      for (const key in target) {
        if (key.startsWith('$') || key.includes('.')) {
          delete target[key];
        } else {
          sanitize(target[key]);
        }
      }
    }
  };
  if (req.body) sanitize(req.body);
  if (req.params) sanitize(req.params);
  if (req.query) sanitize(req.query);
  next();
});

// Data sanitization against XSS (Cross Site Scripting - Express 5 compatible)
app.use((req, res, next) => {
  const clean = (value) => {
    if (typeof value === 'string') {
      return value.replace(/<[^>]*>/g, '');
    }
    if (value && typeof value === 'object') {
      for (const key in value) {
        value[key] = clean(value[key]);
      }
    }
    return value;
  };
  if (req.body) clean(req.body);
  if (req.params) clean(req.params);
  if (req.query) clean(req.query);
  next();
});

const questionRoutes = require('./routes/questionRoutes');

// Mount routes at /api/v1 to match frontend AppConstants
app.use('/api/v1/student', authRoutes);
app.use('/api/v1/tests', examRoutes);
app.use('/api/v1/testResponse', attemptRoutes);
app.use('/api/v1/announcements', announcementRoutes);
app.use('/api/v1/question', questionRoutes);
app.use('/api/v1/ratings', ratingRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/admin/ocr', ocrRoutes);
app.use('/api/v1/pdf', pdfRoutes);
app.use('/api/v1/scan', ocrRoutes); // Backward compatibility for legacy frontend constants

// Health probe for service discovery
app.use('/api/v1/health', healthRoutes);

// Direct health endpoint (fallback) to simplify probes
app.get('/api/v1/health', (req, res) => {
  res.json({ success: true, uptime: process.uptime(), timestamp: Date.now() });
});

// Expose a top-level /health for simpler probes and monitoring systems
app.use('/health', healthRoutes);
app.get('/health', (req, res) => {
  console.log('[Health] probe received');
  res.json({ success: true, uptime: process.uptime(), timestamp: Date.now() });
});

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
