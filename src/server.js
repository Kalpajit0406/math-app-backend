require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

// Import routes
const authRoutes = require('./routes/authRoutes');
const examRoutes = require('./routes/examRoutes');
const attemptRoutes = require('./routes/attemptRoutes');
const announcementRoutes = require('./routes/announcementRoutes');
const ocrRoutes = require('./routes/ocrRoutes');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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
