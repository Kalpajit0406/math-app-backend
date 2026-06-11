require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const os = require('os');
// Mongo sanitization is handled via custom middleware below
// XSS sanitization is handled via custom middleware below
const connectDB = require('./config/db');

// Import routes
const authRoutes = require('./routes/authRoutes');
const examRoutes = require('./routes/examRoutes');
const attemptRoutes = require('./routes/attemptRoutes');
const announcementRoutes = require('./routes/announcementRoutes');
const ocrRoutes = require('./routes/ocrRoutes');
const ocrSessionRoutes = require('./routes/ocrSessionRoutes');
const pdfRoutes = require('./routes/pdfRoutes');
const ratingRoutes = require('./routes/ratingRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const healthRoutes = require('./routes/healthRoutes');
const selfAssessmentRoutes = require('./routes/selfAssessmentRoutes');
const errorHandler = require('./middleware/errorHandler');

const path = require('path');
const app = express();
app.set('trust proxy', true);
app.use('/public', express.static(path.join(__dirname, '../public')));

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

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

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
const chapterRoutes = require('./routes/chapterRoutes');

// Mount routes at /api/v1 to match frontend AppConstants
app.use('/api/v1/student', authRoutes);
app.use('/api/v1/tests', examRoutes);
app.use('/api/v1/testResponse', attemptRoutes);
app.use('/api/v1/announcements', announcementRoutes);
app.use('/api/v1/question', questionRoutes);
app.use('/api/v1/chapters', chapterRoutes);
app.use('/api/v1/ratings', ratingRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/admin/ocr/session', ocrSessionRoutes);
app.use('/api/v1/admin/ocr', ocrRoutes);
app.use('/api/v1/pdf', pdfRoutes);
app.use('/api/v1/self-assessment', selfAssessmentRoutes);
app.use('/api/v1/scan', ocrRoutes); // Backward compatibility for legacy frontend constants

// Health probe for service discovery
app.use('/api', healthRoutes);
app.use('/api/v1/health', healthRoutes);

// Direct health endpoint (fallback) to simplify probes
app.get('/api/v1/health', (req, res) => {
  res.json({ success: true, uptime: process.uptime(), timestamp: Date.now() });
});

// Flutter compatibility health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mongo: 'connected',
    ocr: 'connected',
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

// OCR compatibility health endpoint
app.get('/api/v1/admin/ocr/health', (req, res) => {
  res.json({
    success: true,
    service: 'ocr',
    status: 'operational',
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
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

app.use(errorHandler);

const PORT = process.env.PORT || 3000;

connectDB()
  .then(() => {
    const listenHost = '0.0.0.0';
    const server = app.listen(PORT, listenHost, () => {
      const interfaces = os.networkInterfaces();
      const lanIPs = [];

      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            lanIPs.push(iface.address);
          }
        }
      }

      console.log('\n╔════════════════════════════════════════════════════════╗');
      console.log('║               MathsWithSD Backend Ready               ║');
      console.log('╚════════════════════════════════════════════════════════╝');
      console.log(`Local: http://localhost:${PORT}`);
      if (lanIPs.length > 0) {
        for (const ip of lanIPs) {
          console.log(`LAN:   http://${ip}:${PORT}`);
        }
      } else {
        console.log('LAN:   no external IPv4 address detected');
      }
      console.log(`Health: http://localhost:${PORT}/api/health`);
      console.log(`OCR:    http://localhost:${PORT}/api/v1/admin/ocr/health`);
      console.log(`Bind:   ${listenHost}`);
    });

    // Initialize WebSockets for live exam integrity monitoring and timer authority
    const { initExamWebSocket } = require('./services/examWebSocketService');
    initExamWebSocket(server);

    // Start periodic stale self-assessment session cleaner
    const SelfAssessmentService = require('./services/selfAssessmentService');
    setInterval(() => {
      SelfAssessmentService.cleanupStaleSessions().catch(err => {
        console.error('[SelfAssessment] Stale cleaner error:', err.message);
      });
    }, 30000);
  })
  .catch((error) => {
    console.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  });
