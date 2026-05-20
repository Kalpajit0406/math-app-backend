# Math with SD - Backend Architecture Overview

## Table of Contents
1. [Folder & File Structure](#folder--file-structure)
2. [Main Entry Point & Server Setup](#main-entry-point--server-setup)
3. [Database Connection Setup](#database-connection-setup)
4. [Data Models & Relationships](#data-models--relationships)
5. [Controllers & Routes](#controllers--routes)
6. [Middleware Structure](#middleware-structure)
7. [Services & Utilities](#services--utilities)
8. [Authentication Flow](#authentication-flow)
9. [OCR Pipeline (Detailed)](#ocr-pipeline-detailed)
10. [Image Upload & Processing Flow](#image-upload--processing-flow)
11. [Data Flow Patterns](#data-flow-patterns)
12. [Issues & Concerns](#issues--concerns)

---

## Folder & File Structure

```
math-app-backend/
├── src/
│   ├── server.js                    # Main Express app setup
│   ├── config/
│   │   └── db.js                    # MongoDB connection with retry logic
│   ├── controllers/                 # Request handlers
│   │   ├── authController.js        # Auth operations (login, register, student mgmt)
│   │   ├── examController.js        # Exam CRUD operations
│   │   ├── attemptController.js     # Test attempt handling
│   │   ├── questionController.js    # Question CRUD (with diagram upload)
│   │   ├── announcementController.js# Announcement CRUD
│   │   └── ocrController.js         # OCR image scanning
│   ├── middleware/
│   │   ├── authMiddleware.js        # JWT token validation
│   │   ├── roleMiddleware.js        # Role-based access control
│   │   ├── uploadMiddleware.js      # Multer file upload config
│   │   └── errorMiddleware.js       # Global error handler
│   ├── models/                      # Mongoose schemas
│   │   ├── userModel.js             # Generic user model
│   │   ├── studentModel.js          # Student-specific model
│   │   ├── examModel.js             # Exam with embedded questions
│   │   ├── questionModel.js         # Question bank model
│   │   ├── attemptModel.js          # Student test attempts
│   │   └── announcementModel.js     # Announcements
│   ├── services/                    # Business logic
│   │   ├── authService.js           # Login/register logic
│   │   ├── examService.js           # Exam operations
│   │   ├── attemptService.js        # Scoring and attempt handling
│   │   ├── ocrPipeline.js           # Complete OCR orchestration
│   │   └── mathpixService.js        # Mathpix API integration
│   ├── routes/                      # Express route handlers
│   │   ├── authRoutes.js            # /api/v1/student/*
│   │   ├── examRoutes.js            # /api/v1/tests/*
│   │   ├── attemptRoutes.js         # /api/v1/testResponse/*
│   │   ├── questionRoutes.js        # /api/v1/question/*
│   │   ├── announcementRoutes.js    # /api/v1/announcements/*
│   │   └── ocrRoutes.js             # /api/v1/admin/ocr, /api/v1/scan
│   └── utils/                       # Utilities
│       ├── cloudinary.js            # Cloudinary image upload
│       ├── apiResponse.js           # Response formatting
│       └── errorResponse.js         # Error formatting
├── public/
│   └── temp/                        # Temporary file storage (disk upload)
├── package.json                     # Dependencies
├── server.js                        # Entry point (runs src/server.js)
└── .env                             # Environment variables
```

---

## Main Entry Point & Server Setup

**File**: [src/server.js](src/server.js)

### Server Initialization Flow:
1. **Load Environment**: `dotenv.config()` loads `.env` variables
2. **Import Dependencies**:
   - Express.js (web framework)
   - CORS (cross-origin requests)
   - Helmet (security headers)
   - Rate limiting (API abuse prevention)
   - Mongoose (MongoDB ODM)
   - Data sanitization (NoSQL injection, XSS prevention)

3. **Security Middleware Stack**:
   ```javascript
   app.use(helmet());                          // Secure HTTP headers
   app.use('/api/', apiLimiter);              // 200 req/15min globally
   app.use('/api/v1/student/login', authOcrLimiter);  // 50 req/15min for auth
   app.use('/api/v1/admin/ocr', authOcrLimiter);      // 50 req/15min for OCR
   app.use(mongoSanitize());                  // Prevent NoSQL injection
   app.use(xss());                            // Prevent XSS attacks
   ```

4. **CORS Configuration**: 
   - Whitelist: `ALLOWED_ORIGINS` env var (comma-separated)
   - Fallback: `['*']` if not configured
   - Credentials: `true`

5. **JSON Parsing**: Max payload size = 10MB

6. **Route Mounting** at `/api/v1`:
   - `/student/*` → Authentication (login, register, student management)
   - `/tests/*` → Exam operations
   - `/testResponse/*` → Attempt submission
   - `/question/*` → Question bank
   - `/announcements/*` → Announcements
   - `/admin/ocr` and `/scan` → OCR scanning (backward compatibility)

7. **Database Connection**: 
   - Calls `connectDB()` before starting server
   - Listens on all interfaces (`0.0.0.0:${PORT}`)

---

## Database Connection Setup

**File**: [src/config/db.js](src/config/db.js)

### Connection Strategy:
```
Primary (SRV URI) → Fallback (Direct URI) → Retry Loop
```

### Key Features:
| Feature | Config | Purpose |
|---------|--------|---------|
| **Primary URI** | `MONGODB_URI` | SRV-based connection (e.g., `mongodb+srv://...`) |
| **Fallback URI** | `MONGODB_URI_DIRECT` | Direct replica set URI (e.g., `mongodb://...`) |
| **Max Retries** | `MONGODB_MAX_RETRIES` (default: 5) | Attempts before failure |
| **Retry Delay** | `MONGODB_RETRY_DELAY_MS` (default: 2000ms) | Initial backoff |
| **Pool Size** | Min: 2, Max: 20 | Connection pooling |
| **Timeouts** | Server: 10s, Socket: 45s | Connection/operation limits |
| **Auto Index** | Enabled (non-prod) | Auto-create indexes |

### Connection Listeners:
- `connected`: Logs success
- `reconnected`: Auto-reconnection successful
- `disconnected`: Warns about loss
- `error`: Logs connection errors

### Error Handling:
- **DNS/SRV errors**: Triggers fallback URI attempt
- **Exhausted retries**: Process exits with error code 1
- **Exponential backoff**: Reduces connection storm

---

## Data Models & Relationships

### 1. User Model

**File**: [src/models/userModel.js](src/models/userModel.js)

```javascript
{
  name: String,
  email: String (unique),
  password: String,
  role: 'student' | 'teacher',
  timestamps: true
}
```
**Usage**: Optional alternative to Student model

---

### 2. Student Model

**File**: [src/models/studentModel.js](src/models/studentModel.js)

```javascript
{
  firstName: String (required),
  lastName: String (required),
  dateOfBirth: String,
  gender: 'Male' | 'Female' | 'Other',
  classNo: Number (9|10|11|12) (required),
  language: 'Bengali' | 'English' | 'Both' (required),
  fatherName: String,
  studentPhone: String (unique, required),
  guardianPhone: String (required),
  password: String (required, bcrypt hashed),
  role: 'student' | 'admin' | 'teacher' (default: 'student'),
  verified: Boolean (default: false),
  isRejected: Boolean (default: false),
  timestamps: true
}
```
**Relationships**:
- → Exam (via `createdBy` in ExamModel)
- → Attempt (via `userId` in AttemptModel)

---

### 3. Exam Model

**File**: [src/models/examModel.js](src/models/examModel.js)

```javascript
{
  title: String,
  duration: Number (in minutes),
  date: String,
  time: String,
  classNo: Number,
  language: 'Bengali' | 'English' | 'Both',
  totalQuestions: Number,
  totalTime: Number,
  questions: [
    {
      type: 'mcq' | 'numeric',
      questionText: String,
      options: [String],
      correctAnswer: String
    }
  ],
  createdBy: ObjectId → Student,
  timestamps: true
}
```
**Embedded Structure**: Questions are **embedded** (not referenced)

---

### 4. Question Model (Question Bank)

**File**: [src/models/questionModel.js](src/models/questionModel.js)

```javascript
{
  language: 'Bengali' | 'English' (required),
  chapter: String (required),
  classNo: Number (required),
  correctAnswer: String (required),
  options: [String] (exactly 4, required),
  question: String (required),
  diagram: String (URL to Cloudinary image),
  timestamps: true
}
```
**Purpose**: Reusable question bank (separate from embedded Exam questions)

---

### 5. Attempt Model

**File**: [src/models/attemptModel.js](src/models/attemptModel.js)

```javascript
{
  userId: ObjectId → Student (required),
  examId: ObjectId → Exam (required),
  score: Number (default: 0),
  responses: [
    {
      questionId: ObjectId,
      userAnswer: String,
      isCorrect: Boolean
    }
  ],
  startTime: Date,
  endTime: Date (null until submitted),
  timestamps: true
}
```
**Logic**:
- `endTime === null` → Attempt in progress
- `endTime` set → Attempt submitted
- Prevents re-submission (checked in service)

---

### 6. Announcement Model

**File**: [src/models/announcementModel.js](src/models/announcementModel.js)

```javascript
{
  title: String (required),
  message: String (required),
  targetClass: String ('9'|'10'|'11'|'12'|'all'),
  image: String (optional URL),
  timestamps: true
}
```

---

## Controllers & Routes

### Route Structure Map

```
GET/POST /api/v1/student/
├── POST /register                    → authController.register()
├── POST /login                       → authController.login()
├── GET  /me                          → authController.me()
├── GET  /students (admin)            → authController.getAllStudents()
├── POST /accept (admin)              → authController.acceptStudent()
└── POST /reject (admin)              → authController.rejectStudent()

GET/POST /api/v1/tests/
├── POST /create (teacher/admin)      → examController.createExam()
├── GET  /                            → examController.getExams()
└── GET  /:id                         → examController.getExamById()

GET/POST /api/v1/testResponse/
├── POST /start                       → attemptController.startAttempt()
├── POST /submit                      → attemptController.submitAttempt()
├── GET  /result/:id                  → attemptController.getResult()
└── GET  /leaderboard/:examId         → attemptController.getLeaderboard()

GET/POST /api/v1/question/
├── GET  /questions                   → questionController.getQuestions()
├── POST /addQuestion (teacher/admin) → questionController.addQuestion()
├── PUT  /update/:id (teacher/admin)  → questionController.updateQuestion()
└── DELETE /delete/:id (teacher/admin)→ questionController.deleteQuestion()

GET/POST /api/v1/announcements/
├── GET  /                            → announcementController.getAnnouncements()
└── POST /admin (admin)               → announcementController.createAnnouncement()

POST /api/v1/admin/ocr/* or /api/v1/scan/*
├── POST /scan (teacher/admin)        → ocrController.scanImage()
└── POST /process (teacher/admin)     → ocrController.scanImage() [alias]
```

---

## Middleware Structure

### 1. Authentication Middleware

**File**: [src/middleware/authMiddleware.js](src/middleware/authMiddleware.js)

```
Authorization: Bearer <JWT_TOKEN>
    ↓
validateTokenFormat() → Extract scheme + token
    ↓
Check for "dummy_token" (dev mode only)
    ↓
jwt.verify(token, JWT_SECRET)
    ↓
req.user = { id, phone, role } (decoded payload)
    ↓
next() or 401 Unauthorized
```

**Key Points**:
- Supports dummy token in dev mode (`ALLOW_DUMMY_AUTH=true`)
- JWT expiration: 24 hours
- Secret from `JWT_SECRET` or `ACCESS_TOKEN_SECRET`

---

### 2. Role-Based Authorization Middleware

**File**: [src/middleware/roleMiddleware.js](src/middleware/roleMiddleware.js)

```javascript
authorizeRoles('admin', 'teacher')
    ↓
Check req.user.role
    ↓
403 Forbidden if not in allowed list
    ↓
next() if authorized
```

---

### 3. Upload Middleware

**File**: [src/middleware/uploadMiddleware.js](src/middleware/uploadMiddleware.js)

Two implementations:

#### A. Memory Upload (`secureMemoryUpload`)
```javascript
multer({
  storage: memoryStorage(),          // Loads to req.file.buffer
  fileFilter: imageFileFilter,        // JPEG|PNG|WEBP only
  limits: { fileSize: 5MB, files: 1 }
})
```
**Use Case**: OCR scanning (streaming to Mathpix)

#### B. Disk Upload (`secureDiskUpload`)
```javascript
multer({
  storage: diskStorage({
    destination: '/public/temp',      // Local temp folder
    filename: alphanumeric sanitization
  }),
  fileFilter: imageFileFilter,
  limits: { fileSize: 5MB, files: 1 }
})
```
**Use Case**: Question diagram upload → Cloudinary

#### File Filter Logic:
1. Whitelist MIME types: `image/jpeg`, `image/png`, `image/webp`
2. Infer MIME from extension if missing
3. Reject anything else with "Security violation" error
4. Max file size: 5MB
5. Single file per request

---

### 4. Error Handler Middleware

**File**: [src/middleware/errorMiddleware.js](src/middleware/errorMiddleware.js)

```javascript
errorHandler(err, req, res, next)
    ↓
Match error type:
├── CastError        → 404 (Invalid ObjectId)
├── 11000 (duplicate)→ 400 (Duplicate field)
├── ValidationError  → 400 (Schema validation)
└── Other            → 500 (Server error)
    ↓
res.status(statusCode).json({ success: false, message })
```

---

## Services & Utilities

### 1. Auth Service

**File**: [src/services/authService.js](src/services/authService.js)

#### `register(studentData)`
1. Validate phone + password
2. Check if phone already exists
3. Hash password with bcrypt (salt: 10)
4. Create new Student document
5. Return saved document

#### `login(studentPhone, password)`
1. **Admin Hardcoded Bypass** ⚠️ **SECURITY ISSUE**:
   ```javascript
   if (studentPhone === '6289855545') {
     // Auto-creates admin account if not exists
     // Allows login without password validation
   }
   ```
2. Find student by phone
3. Compare password with bcrypt
4. Generate JWT (24h expiration)
5. Return `{ student, accessToken }`

---

### 2. Exam Service

**File**: [src/services/examService.js](src/services/examService.js)

#### `createExam(examData, userId)`
- Auto-normalize fields: `title`, `duration`, `totalTime`, `totalQuestions`
- Embed questions directly
- Set `createdBy` to current user
- Return saved Exam

#### `getExams()`
- Fetch all exams, sorted by creation (newest first)

#### `getExamById(id)`
- Return exam or throw "Exam not found"

---

### 3. Attempt Service

**File**: [src/services/attemptService.js](src/services/attemptService.js)

#### `startAttempt(userId, examId)`
1. Check if exam exists
2. Look for existing active attempt (endTime missing)
3. Return existing or create new
4. Prevents duplicate attempts

#### `submitAttempt(userId, attemptId, responses)`
1. Validate user owns attempt
2. Check attempt not already submitted
3. Score calculation:
   ```javascript
   for each response:
     if userAnswer === question.correctAnswer (case-insensitive):
       score++
   ```
4. Deduplicate responses (prevents double-scoring)
5. Set `endTime` and save

#### `getResult(userId, role, attemptId)`
1. Fetch attempt with exam populated
2. **Authorization**:
   - Owner: can view own attempt
   - Admin/Teacher: can view any attempt
   - Others: 403 Forbidden

---

### 4. OCR Pipeline (Orchestration)

**File**: [src/services/ocrPipeline.js](src/services/ocrPipeline.js)

Complete OCR processing workflow with 5 stages:

#### **Stage 1: Image Preprocessing**
```
Input: data:image/..., URL, or base64
    ↓
Load buffer (fetch if URL)
    ↓
Sharp processing:
├── Resize to max 1600x1600 (maintain aspect)
├── Convert to grayscale
├── Normalize (stretch dynamic range)
├── Linear contrast (1.4 boost, -0.15 offset)
├── Sharpen (sigma: 1.2, flat: 1.0, jagged: 2.0)
    ↓
Output: data:image/jpeg;base64,... (optimized for OCR)
```
**Purpose**: Enhance mathematical symbols, separate faint handwriting from background

#### **Stage 2: Mathpix OCR Service**
```
Send preprocessed image to Mathpix API
    ↓
Retry logic (3 attempts):
├── Attempt 1: Immediate
├── Attempt 2: After 1 second delay
├── Attempt 3: After 2 second delay
    ↓
Response contains:
├── text: Plain OCR text
├── latex_styled: LaTeX markup
├── confidence: Confidence score
    ↓
Return result or throw error
```

**Request Payload**:
```javascript
{
  src: processedImageData,
  formats: ['text', 'latex_styled'],
  data_options: { include_latex: true },
  math_inline_delimiters: ['$', '$'],
  math_display_delimiters: ['$$', '$$'],
  timeout: 25000 // 25 second timeout
}
```

#### **Stage 3: LaTeX Sanitization**
```
Input: Raw LaTeX string
    ↓
Apply fixes:
├── Convert \[ \] to $$ $$
├── Convert \( \) to $ $
├── Balance \begin{env}...\end{env} pairs
├── Balance curly braces { }
├── Balance square brackets [ ]
├── Balance dollar signs $
├── Remove \Big, \bigg sizing operators
├── Clean \text{...} commands
    ↓
Output: KaTeX-compatible LaTeX
```

**Supported Environments**: `matrix`, `pmatrix`, `bmatrix`, `align`, `cases`, `array`, `vmatrix`

#### **Stage 4: MCQ Detection**
```
Input: Sanitized LaTeX text
    ↓
Strategy 1: Inline MCQ (e.g., "What is 2+2? (A) 3 (B) 4 (C) 5 (D) 6")
├── Regex: /[\(\[]?([a-dA-D1-4i-vI-V])[\)\]\.\-]\s*([^()\[\]\n]+?)/g
├── Extract 4 consecutive options
├── Return: { question, options: [{label, text}, ...] }

Strategy 2: Line-by-line MCQ
├── Split by newlines
├── Match option labels: (A), A., a), (i), i., (I), I., 1-4, i-iv
├── Build option array (pad to 4 options)
├── Return: { question, options: [{label, text}, ...] }
    ↓
Return parsed MCQ or null if < 2 options found
```

#### **Stage 5: Validation**
```
Input: Raw OCR result
    ↓
Extract confidence (from latex_confidence or confidence)
    ↓
Rate confidence:
├── < 0.6:  'low'
├── 0.6-0.85: 'medium'
├── >= 0.85: 'high'
    ↓
Check for corruption:
├── Has \begin without \end → isCorrupt = true
├── Empty LaTeX → isValid = false
    ↓
Return: { confidence, rating, isValid }
```

#### **Output Structure**
```javascript
{
  rawText: "",           // Plain text from Mathpix
  latex: "",             // Sanitized LaTeX
  parsedMcq: {           // Detected MCQ or null
    question: "...",
    options: [
      { label: 'A', text: '...' },
      { label: 'B', text: '...' },
      { label: 'C', text: '...' },
      { label: 'D', text: '...' }
    ]
  },
  confidence: 0.85,      // 0-1 score
  qualityRating: 'high', // 'high'|'medium'|'low'
  isValid: true          // Boolean
}
```

---

### 5. Mathpix Service

**File**: [src/services/mathpixService.js](src/services/mathpixService.js)

Simpler version of OCR pipeline (single function). Key difference from ocrPipeline.js:
- Same image preprocessing
- Same Mathpix API call (no retry logic)
- Same LaTeX sanitization
- Returns: `{ text, latex, confidence, raw }`

**Used by**: OCR Controller (exports `processImage()`)

---

### 6. Question Upload to Cloudinary

**File**: [src/utils/cloudinary.js](src/utils/cloudinary.js)

```
uploadOnCloudinary(localFilePath)
    ↓
cloudinary.uploader.upload(file, { resource_type: 'auto' })
    ↓
If success:
├── Delete temp file
├── Return Cloudinary response (includes secure_url)
    ↓
If error:
├── Delete temp file if exists
├── Return null
```

---

## Authentication Flow

### Complete Login Flow

```
POST /api/v1/student/login
    │
    ├─► authMiddleware: SKIP (no auth required for login)
    │
    ├─► authController.login()
    │   ├─► Extract { studentPhone, password }
    │   └─► authService.login(phone, password)
    │       ├─► Check hardcoded admin phone '6289855545'
    │       │   (⚠️ SECURITY ISSUE: No password validation)
    │       ├─► Find student by phone
    │       ├─► bcrypt.compare(password, hashedPassword)
    │       ├─► Generate JWT
    │       │   jwt.sign(
    │       │     { id, phone, role },
    │       │     JWT_SECRET,
    │       │     { expiresIn: '24h' }
    │       │   )
    │       └─► Return { student, accessToken }
    │
    └─► Response: 
        {
          success: true,
          data: {
            student: { id, firstName, lastName, classNo, ... },
            accessToken: "eyJhbGc..."
          }
        }
```

### Authenticated Request Flow

```
GET /api/v1/student/me
    │
    ├─► Header: Authorization: Bearer <token>
    │
    ├─► authMiddleware
    │   ├─► Extract "Bearer <token>"
    │   ├─► jwt.verify(token, JWT_SECRET)
    │   ├─► req.user = { id, phone, role }
    │   └─► next()
    │
    ├─► authorizeRoles('admin') [if required]
    │   ├─► Check req.user.role
    │   └─► 403 if not authorized
    │
    ├─► Controller
    │   ├─► req.user.id available
    │   └─► Perform action
    │
    └─► Response
```

### Token Validation

| Scenario | Result |
|----------|--------|
| No token | 401 "No token, authorization denied" |
| Invalid format | 401 "Token is not valid" |
| Expired | 401 "Token is not valid" |
| Dummy token (dev only) | 200 (req.user = dummy_user_id) |
| Invalid signature | 401 "Token is not valid" |
| Valid token | 200 (proceed) |

---

## OCR Pipeline (Detailed)

### Complete OCR Request Flow

```
POST /api/v1/admin/ocr/scan
    │
    ├─► Headers: Authorization: Bearer <token>
    │
    ├─► authMiddleware
    │   └─► Validate JWT token
    │
    ├─► roleMiddleware.authorizeRoles('admin', 'teacher')
    │   └─► Check req.user.role
    │
    ├─► secureMemoryUpload.single('image')
    │   ├─► Validate MIME type (JPEG|PNG|WEBP)
    │   ├─► Check file size (max 5MB)
    │   ├─► Load to req.file.buffer (memory)
    │   └─► Skip disk write
    │
    ├─► ocrController.scanImage()
    │   ├─► resolveSource(req)
    │   │   ├─► Check req.file (priority)
    │   │   ├─► Check req.body.base64Image (fallback)
    │   │   └─► Check req.body.imageUrl (fallback)
    │   │
    │   └─► OCRPipeline.run(source)
    │       ├─► ImagePreprocessor.preprocess()
    │       ├─► OCRService.performOcr()
    │       ├─► LatexSanitizer.sanitize()
    │       ├─► MCQDetector.detect()
    │       └─► OCRResultValidator.validate()
    │
    └─► Response:
        {
          success: true,
          data: {
            rawText: "...",
            latex: "...",
            parsedMcq: { question, options },
            confidence: 0.85,
            qualityRating: 'high',
            sourceType: 'file'|'url'|'base64'
          }
        }
```

### Image Source Resolution

| Priority | Condition | Format | Use Case |
|----------|-----------|--------|----------|
| 1st | `req.file` exists | Buffer → data URI | Mobile app file upload |
| 2nd | `req.body.base64Image` | data:image/...;base64 | Web/app form data |
| 3rd | `req.body.imageUrl` | HTTP/HTTPS URL | External image link |
| None | No source | 400 Bad Request | Error |

---

## Image Upload & Processing Flow

### Diagram Upload (Question)

```
POST /api/v1/question/addQuestion
    │
    ├─► Multipart form-data with 'diagram' file
    │
    ├─► secureDiskUpload.single('diagram')
    │   ├─► Validate MIME type
    │   ├─► Generate safe filename: ${Date.now()}-${sanitized_name}.ext
    │   ├─► Store in /public/temp/
    │   └─► Set req.file.path
    │
    ├─► questionController.addQuestion()
    │   ├─► Extract form fields: chapter, classNo, options, question, etc.
    │   ├─► Parse JSON (if options sent as string)
    │   │
    │   └─► if (req.file):
    │       └─► uploadOnCloudinary(req.file.path)
    │           ├─► cloudinary.uploader.upload()
    │           ├─► fs.unlinkSync() [delete temp file]
    │           └─► Extract secure_url
    │   
    │   └─► Question.create({
    │         chapter, classNo, options, question, language,
    │         diagram: diagramUrl (or null)
    │       })
    │
    └─► Response:
        {
          success: true,
          data: {
            id, chapter, classNo, options, question, diagram
          }
        }
```

### OCR Image Upload

```
POST /api/v1/admin/ocr/scan (multipart/form-data)
    │
    ├─► secureMemoryUpload.single('image')
    │   ├─► Load to req.file.buffer (not disk)
    │   └─► MIME: JPEG|PNG|WEBP
    │
    ├─► bufferToDataUri(req.file.buffer, mimetype)
    │   └─► data:image/jpeg;base64,...
    │
    ├─► OCRPipeline.run() [no disk write]
    │
    └─► No cleanup needed (memory-only)
```

---

## Data Flow Patterns

### Pattern 1: Student Test Attempt

```
Student A
    ↓
POST /api/v1/testResponse/start { examId }
    ├─► Create Attempt { userId: A, examId, startTime: now, endTime: null }
    └─► Return attemptId
    
    ↓
[Student completes test]
    ↓
POST /api/v1/testResponse/submit { attemptId, responses: [...] }
    ├─► Find Attempt
    ├─► Compare each response against exam.questions.correctAnswer
    ├─► Calculate score
    ├─► Set endTime = now
    └─► Save Attempt
    
    ↓
GET /api/v1/testResponse/result/:attemptId
    ├─► Fetch Attempt (populated with student name)
    └─► Return: { attemptId, score, responses, endTime, ... }
```

### Pattern 2: Question Bank Management

```
Teacher
    ↓
POST /api/v1/question/addQuestion (with diagram upload)
    ├─► Upload diagram to Cloudinary
    ├─► Create Question { classNo, language, chapter, options, ... }
    └─► Store diagram URL
    
    ↓
GET /api/v1/question/questions?classNo=10&language=English
    └─► Filter + return questions
    
    ↓
PUT /api/v1/question/update/:id (with new diagram)
    ├─► Re-upload diagram (replaces old)
    └─► Update Question
```

### Pattern 3: OCR Scanning Workflow

```
Teacher
    ↓
POST /api/v1/admin/ocr/scan (upload handwritten test image)
    ├─► Preprocess image
    ├─► Send to Mathpix
    ├─► Extract LaTeX + text
    ├─► Detect MCQ structure
    └─► Return parsed question + confidence
    
    ↓
Teacher reviews OCR result
    ↓
Teacher uses parsed MCQ to create question:
POST /api/v1/question/addQuestion
    ├─► Populate fields from OCR output
    └─► Store in Question bank
```

---

## Issues & Concerns

### 🔴 CRITICAL SECURITY ISSUES

#### 1. **Hardcoded Admin Backdoor**

**File**: [src/services/authService.js](src/services/authService.js) (lines ~20-37)

```javascript
if (studentPhone === '6289855545') {
  // AUTO-LOGIN: No password validation!
  // Auto-creates admin account if missing
  // Allows anyone with knowledge of this phone to bypass authentication
}
```

**Risk**: 
- Unauthenticated admin access
- Account creation without verification
- Privilege escalation vector

**Fix**: Remove hardcoded bypass, or at minimum:
1. Add strong environment variable verification
2. Require password validation even for hardcoded account
3. Log all admin access attempts
4. Consider hardware security key authentication

---

#### 2. **OCR Rate Limiting May Be Insufficient**

**File**: [src/server.js](src/server.js) (lines ~29-40)

```javascript
// 50 requests per 15 minutes for OCR
// But Mathpix API likely has tighter limits (unclear from code)
```

**Risk**:
- Attackers can quickly exhaust Mathpix API quota
- No per-user rate limiting (only IP-based)
- No cost/quota tracking

**Fix**:
1. Implement per-user rate limiting (not just IP)
2. Add Mathpix API usage quota monitoring
3. Track API call costs
4. Return 429 with retry-after header

---

#### 3. **Weak Password Requirements**

**File**: [src/services/authService.js](src/services/authService.js)

**Issue**: No password validation:
- No minimum length check
- No complexity requirements (uppercase, digits, symbols)
- No password history
- Single factor authentication (no 2FA)

**Fix**:
```javascript
const validatePassword = (password) => {
  if (password.length < 12) throw new Error("Min 12 chars");
  if (!/[A-Z]/.test(password)) throw new Error("Needs uppercase");
  if (!/[0-9]/.test(password)) throw new Error("Needs digit");
  if (!/[!@#$%^&*]/.test(password)) throw new Error("Needs symbol");
};
```

---

### 🟡 HIGH-PRIORITY ISSUES

#### 4. **No Input Validation in Question Controller**

**File**: [src/controllers/questionController.js](src/controllers/questionController.js) (lines ~1-30)

```javascript
const { chapter, classNo, correctAnswer, options, question, language } = req.body;
// No validation of:
// - Options array length
// - CorrectAnswer matches an option
// - Question text length/format
// - Language enum values
```

**Risk**:
- Invalid data stored in database
- MCQ options mismatch with correctAnswer
- DoS via massive option strings

**Fix**: Use schema validation library (Joi, Zod):
```javascript
const schema = Joi.object({
  options: Joi.array().length(4).items(Joi.string().required()).required(),
  correctAnswer: Joi.string().valid(...options).required(),
  question: Joi.string().min(10).max(10000).required(),
  classNo: Joi.number().valid(9, 10, 11, 12).required(),
});
```

---

#### 5. **LaTeX Sanitization May Still Render Unsafe Content**

**File**: [src/services/ocrPipeline.js](src/services/ocrPipeline.js) (LatexSanitizer)

**Issue**: 
- Balances braces but doesn't validate LaTeX commands
- No blacklist of dangerous environments (e.g., `\write`, `\immediate`, shell escapes)
- No SVG/script injection prevention in rendered output

**Fix**:
1. Use allowlist of safe LaTeX commands
2. Strip dangerous environments
3. Validate LaTeX with KaTeX parser before returning
4. Add Content Security Policy (CSP) headers

---

#### 6. **OCR Confidence Threshold Not Enforced**

**File**: [src/services/ocrPipeline.js](src/services/ocrPipeline.js) (lines ~250-270)

```javascript
// Returns confidence but doesn't reject low-quality scans
return {
  confidence: 0.3,  // Low confidence!
  qualityRating: 'low',
  isValid: true     // Still valid!
};
```

**Risk**: 
- Low-quality OCR results stored as questions
- Incorrect answers propagated to students
- False negatives on validation

**Fix**:
```javascript
const validate = (result) => {
  if (result.confidence < 0.7) {
    throw new Error(`Low confidence (${result.confidence}). Manual review required.`);
  }
  return result;
};
```

---

### 🟡 MEDIUM-PRIORITY ISSUES

#### 7. **No CSRF Protection**

**File**: [src/server.js](src/server.js)

**Issue**: 
- No CSRF tokens in forms
- SPA-based frontend may be vulnerable to cross-site request forgery
- Cookies not marked HttpOnly/SameSite

**Fix**:
```javascript
const csrf = require('csurf');
app.use(csrf({ cookie: false })); // Use session tokens
// Add {{ _csrf }} to all forms
app.use(express.json()); // Already uses JSON, less vulnerable
// Ensure SameSite cookies: res.cookie('name', value, { sameSite: 'Strict' })
```

---

#### 8. **No Attempt Timeout**

**File**: [src/services/attemptService.js](src/services/attemptService.js)

**Issue**:
- Student can start exam and never submit (locks attempt forever)
- No automatic timeout after exam duration
- No session expiration enforcement

**Fix**:
```javascript
const startAttempt = async (userId, examId) => {
  const exam = await Exam.findById(examId);
  const now = new Date();
  const timeoutMs = exam.duration * 60 * 1000; // minutes to ms
  
  // Auto-close attempts older than duration
  await Attempt.deleteMany({
    userId, examId, endTime: null,
    startTime: { $lt: new Date(now - timeoutMs) }
  });
};
```

---

#### 9. **No Logging/Audit Trail**

**Files**: All controllers

**Issue**:
- No request logging (who, what, when)
- No audit trail for admin actions
- No failed login attempt tracking
- Difficult to investigate security incidents

**Fix**:
```javascript
const logAction = (userId, action, resource, details) => {
  AuditLog.create({
    userId, action, resource, details,
    timestamp: new Date(),
    ipAddress: req.ip
  });
};
```

---

#### 10. **JWT Secret Not Rotatable**

**File**: [src/middleware/authMiddleware.js](src/middleware/authMiddleware.js)

**Issue**:
- JWT_SECRET hardcoded at startup
- No key rotation mechanism
- Compromised key invalidates all tokens system-wide

**Fix**:
1. Support multiple JWT keys (current + next)
2. Implement key rotation schedule
3. Use key management service (AWS KMS, Vault)

---

### 🟡 MODERATE-PRIORITY ISSUES

#### 11. **No Database Encryption**

**File**: [src/config/db.js](src/config/db.js)

**Issue**:
- Passwords stored with bcrypt (good)
- But no field-level encryption for sensitive data
- Personal info (phone, name, DOB) stored plaintext

**Fix**:
```javascript
const crypto = require('crypto');
studentSchema.pre('save', async function() {
  if (this.isModified('studentPhone')) {
    this.studentPhone = encrypt(this.studentPhone);
  }
});
```

---

#### 12. **No Pagination on Large Queries**

**File**: [src/controllers/questionController.js](src/controllers/questionController.js)

```javascript
const getQuestions = async (req, res) => {
  const questions = await Question.find(filter).sort({ createdAt: -1 });
  // Returns all questions! No limit/offset
};
```

**Risk**: Memory exhaustion with large datasets

**Fix**:
```javascript
const limit = Math.min(parseInt(req.query.limit || 20), 100);
const skip = parseInt(req.query.skip || 0);
const questions = await Question.find(filter)
  .limit(limit)
  .skip(skip)
  .sort({ createdAt: -1 });
```

---

#### 13. **Image Upload Filename Collision Risk**

**File**: [src/middleware/uploadMiddleware.js](src/middleware/uploadMiddleware.js)

```javascript
filename: (req, file, cb) => {
  const filename = `${Date.now()}-${safeBase}${cleanExt}`;
  // Two uploads within same millisecond = collision
  cb(null, filename);
};
```

**Fix**: Use UUID or crypto randomness:
```javascript
const crypto = require('crypto');
filename: (req, file, cb) => {
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${safeBase}${cleanExt}`;
  cb(null, filename);
};
```

---

#### 14. **Incomplete MCQ Detection Edge Cases**

**File**: [src/services/ocrPipeline.js](src/services/ocrPipeline.js) (MCQDetector)

```javascript
// Doesn't handle:
// - Nested parentheses in options: "(A) (i) text"
// - Roman numerals beyond IV: "V, VI, VII, VIII"
// - Non-ASCII option labels
// - Multi-paragraph options
```

**Fix**: Add comprehensive test cases + regex refinement

---

#### 15. **No Request Validation Library**

**All controllers**

**Issue**:
- Manual validation scattered across controllers
- No consistent error messages
- Vulnerable to type coercion attacks

**Fix**: Use schema validation:
```javascript
const Joi = require('joi');
const schema = Joi.object({
  studentPhone: Joi.string().phone().required(),
  password: Joi.string().min(8).required(),
});
const { error, value } = schema.validate(req.body);
if (error) return res.status(400).json({ error: error.details });
```

---

### 🔵 LOW-PRIORITY ISSUES

#### 16. **Inconsistent Response Format**

**Issue**: Some endpoints return `{ success, data }`, others just `{ data }`

**Fix**: Standardize globally:
```javascript
const sendResponse = (res, statusCode, success, data, message) => {
  res.status(statusCode).json({ success, data, message: message || undefined });
};
```

---

#### 17. **No Webhook/Event System**

**Issue**: Can't notify teachers when students submit attempts in real-time

**Fix**: Implement WebSocket or Server-Sent Events (SSE)

---

#### 18. **Cloudinary Error Handling Suppressed**

**File**: [src/utils/cloudinary.js](src/utils/cloudinary.js)

```javascript
catch (error) {
  // Returns null without logging error details
  return null;
}
```

**Fix**: Log and return error details:
```javascript
catch (error) {
  console.error('Cloudinary upload failed:', error.message);
  return { error: error.message };
}
```

---

## Summary: Key Recommendations

### Priority 1 (Critical):
1. **Remove admin hardcoded backdoor** immediately
2. Add strong password validation
3. Implement per-user rate limiting for OCR
4. Add confidence threshold enforcement for OCR

### Priority 2 (High):
5. Add comprehensive input validation (Joi/Zod)
6. Implement CSRF protection
7. Add audit logging
8. Add request/response pagination

### Priority 3 (Medium):
9. Implement session/attempt timeout
10. Add LaTeX command whitelist
11. Encrypt sensitive database fields
12. Add JWT key rotation

### Priority 4 (Low):
13. Standardize response format
14. Implement real-time notifications
15. Add better error logging

---

**Document Generated**: May 2026  
**Backend Framework**: Express.js + Mongoose  
**Database**: MongoDB (Atlas)  
**OCR Service**: Mathpix API  
**Image Storage**: Cloudinary  
**Authentication**: JWT (24h expiration)  

