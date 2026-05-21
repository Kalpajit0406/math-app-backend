const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const os = require('os');
const connectDB = require('./src/config/db');

// Import Routes
const authRoutes = require('./src/routes/authRoutes');
const examRoutes = require('./src/routes/examRoutes');
const attemptRoutes = require('./src/routes/attemptRoutes');
const questionRoutes = require('./src/routes/questionRoutes');
const announcementRoutes = require('./src/routes/announcementRoutes');
const ocrRoutes = require('./src/routes/ocrRoutes');
const ocrSessionRoutes = require('./src/routes/ocrSessionRoutes');
const pdfRoutes = require('./src/routes/pdfRoutes');

dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/v1/student', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/attempt', attemptRoutes);
app.use('/api/testResponse', attemptRoutes);
app.use('/api/v1/question', questionRoutes);
app.use('/api/v1/announcements', announcementRoutes);
app.use('/api/v1/admin/ocr', ocrRoutes);
app.use('/api/v1/admin/ocr/session', ocrSessionRoutes);
app.use('/api/v1/pdf', pdfRoutes);
// Health Check Endpoints
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Backend is healthy', 
    timestamp: new Date().toISOString()
  });
});

app.get('/api/v1/admin/ocr/health', (req, res) => {
  res.json({ 
    success: true, 
    service: 'OCR', 
    status: 'operational', 
    timestamp: new Date().toISOString() 
  });
});


// Root Endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Maths Exam App API (MongoDB)' });
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Internal Server Error' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
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
  console.log('║    ✔ MATHS WITH SD BACKEND RUNNING ON PORT ' + PORT + '    ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  console.log('Flutter App URLs:');
  if (lanIPs.length > 0) {
    lanIPs.forEach(ip => console.log('  http://' + ip + ':' + PORT));
  }
  console.log('  Health: /api/health');
  console.log('  OCR: /api/v1/admin/ocr\n');
});
