# Mathpix PDF/Document Processing - Developer Implementation Guide

**For:** AI Assistants & Developers  
**Date:** May 20, 2026  
**Purpose:** Enable future implementations of PDF processing features  
**Status:** ✅ Ready for Production

---

## Quick Start (5 Minutes)

### 1. Copy Implementation Files
```bash
# Backend
src/
├── services/mathpixPdfService.js
├── controllers/pdfController.js
└── routes/pdfRoutes.js

# Frontend
lib/
├── widgets/pdf_picker_widget.dart
├── providers/question_provider.dart (enhanced)
└── services/api_service.dart (enhanced)
```

### 2. Set Environment Variables
```bash
MATHPIX_APP_ID=your_app_id
MATHPIX_APP_KEY=your_app_key
```

### 3. Mount Routes in Server
```javascript
const pdfRoutes = require('./routes/pdfRoutes');
app.use('/api/v1/pdf', pdfRoutes);
```

### 4. Add Flutter Imports
```dart
import 'widgets/pdf_picker_widget.dart';
```

### 5. Test
```bash
# Backend
npm test -- --grep "pdf"

# Flutter
flutter test
```

---

## Technology Stack

### Backend Requirements
| Technology | Version | Purpose |
|-----------|---------|---------|
| Node.js | 18+ | Runtime |
| Express.js | 4.18+ | Framework |
| Multer | 1.4+ | File uploads |
| Axios/node-fetch | 1.3+/2.6+ | HTTP requests |
| Form-data | 4.0+ | Multipart requests |

### Frontend Requirements
| Technology | Version | Purpose |
|-----------|---------|---------|
| Flutter | 3.0+ | Framework |
| Dart | 2.17+ | Language |
| Provider | 6.0+ | State management |
| file_picker | 5.0+ | File selection |
| permission_handler | 11.0+ | Permissions |

### External Services
| Service | Endpoint | Purpose |
|---------|----------|---------|
| Mathpix API v3 | api.mathpix.com/v3 | PDF processing |

---

## File Structure & Integration Points

### Backend Directory Structure
```
src/
├── services/
│   ├── mathpixPdfService.js        [NEW - 650 lines]
│   └── mathpixService.js           [Existing - image OCR]
├── controllers/
│   ├── pdfController.js             [NEW - 450 lines]
│   ├── questionController.js        [Existing]
│   └── authController.js            [Existing]
├── routes/
│   ├── pdfRoutes.js                 [NEW - 200 lines]
│   ├── questionRoutes.js            [Existing]
│   └── authRoutes.js                [Existing]
├── middleware/
│   ├── authMiddleware.js            [Existing - used by PDF routes]
│   ├── validationMiddleware.js      [Existing]
│   └── errorMiddleware.js           [Existing - catches PDF errors]
├── models/
│   ├── questionModel.js             [Existing - stores questions]
│   └── queueModel.js                [Existing - stores queue]
└── server.js                        [Modified - +5 lines]
```

### Frontend Directory Structure
```
lib/
├── widgets/
│   ├── pdf_picker_widget.dart       [NEW - 500 lines]
│   ├── camera_widget.dart           [Existing]
│   └── gallery_widget.dart          [Existing]
├── screens/
│   ├── admin/
│   │   └── create_question_screen.dart [Modified - +60 lines]
│   └── teacher/
│       └── question_screen.dart     [Existing]
├── providers/
│   ├── question_provider.dart       [Enhanced - +150 lines]
│   └── auth_provider.dart           [Existing]
├── services/
│   ├── api_service.dart             [Enhanced - +250 lines]
│   └── storage_service.dart         [Existing]
└── models/
    ├── question_model.dart          [Existing - OCR to questions]
    ├── pdf_response_model.dart      [NEW - 50 lines]
    └── ocr_response_model.dart      [Existing]
```

---

## Implementation Checklist for New Codebase

### Step 1: Backend Setup (1 hour)

- [ ] Copy `src/services/mathpixPdfService.js`
  - **Key exports:** `MathpixPdfService` class
  - **Dependencies:** `axios`, `form-data`, `fs`, `path`
  - **Integration:** Used by `pdfController.js`
  
- [ ] Copy `src/controllers/pdfController.js`
  - **Key exports:** `pdfController` object with 7 methods
  - **Dependencies:** `MathpixPdfService`, `MCQDetector`, `QuestionQueueManager`
  - **Integration:** Mounted in `pdfRoutes.js`
  
- [ ] Copy `src/routes/pdfRoutes.js`
  - **Key exports:** Express router with 7 endpoints
  - **Dependencies:** `authMiddleware`, `multer`, `pdfController`
  - **Integration:** Mounted in `server.js` at `/api/v1/pdf`
  
- [ ] Update `src/server.js`
  - Add import: `const pdfRoutes = require('./routes/pdfRoutes');`
  - Add rate limiter for `/api/v1/pdf` (50/15min)
  - Mount routes: `app.use('/api/v1/pdf', pdfRoutes);`
  
- [ ] Install dependencies
  ```bash
  npm install form-data multer
  ```

- [ ] Set environment variables
  ```bash
  MATHPIX_APP_ID=...
  MATHPIX_APP_KEY=...
  ```

- [ ] Test backend endpoints
  ```bash
  npm test -- pdfController
  ```

### Step 2: Frontend Setup (1.5 hours)

- [ ] Copy `lib/widgets/pdf_picker_widget.dart`
  - **Key exports:** `PdfPickerWidget`, `PdfExtractionStatusWidget`
  - **Dependencies:** `file_picker`, `permission_handler`
  - **Usage:** Place in question creation flow
  
- [ ] Update `lib/providers/question_provider.dart`
  - Add 7 new methods (copy from implementation)
  - Add 2 new state variables: `_showPdfPicker`, `_queueSessionId`
  - No breaking changes to existing methods
  
- [ ] Update `lib/services/api_service.dart`
  - Add 7 new HTTP methods for PDF endpoints
  - No breaking changes to existing methods
  
- [ ] Update `lib/screens/admin/create_question_screen.dart`
  - Add import: `import 'widgets/pdf_picker_widget.dart';`
  - Add state: `bool _showPdfPicker = false;`
  - Modify `_buildInitialScanView()`: Add PDF button
  - Modify `build()`: Conditional view for PDF picker
  
- [ ] Install dependencies
  ```bash
  flutter pub add file_picker permission_handler
  flutter pub get
  ```

- [ ] Update pubspec.yaml (Android/iOS)
  ```yaml
  # iOS: Add to Info.plist
  # Android: Already configured by permission_handler
  ```

- [ ] Test Flutter widgets
  ```bash
  flutter test
  ```

### Step 3: Integration Testing (1 hour)

- [ ] Backend integration
  - [ ] POST /scan with test PDF
  - [ ] Verify Mathpix API call
  - [ ] Check status polling
  - [ ] Download result
  
- [ ] Frontend integration
  - [ ] Open PDF picker widget
  - [ ] Select test PDF
  - [ ] Verify upload
  - [ ] Check extraction
  
- [ ] End-to-end
  - [ ] Upload PDF → Extract questions → Populate queue
  - [ ] Verify all 5 questions extracted
  - [ ] Navigate queue successfully

### Step 4: Deployment (30 min)

- [ ] Backend deployment
  ```bash
  # Build
  npm run build
  
  # Deploy to staging
  npm run deploy:staging
  
  # Verify endpoints
  curl -X POST http://staging.api/v1/pdf/scan \
    -H "Authorization: Bearer token" \
    -F "file=@test.pdf"
  ```

- [ ] Frontend deployment
  ```bash
  # Build APK
  flutter build apk --release
  
  # Deploy to Play Store
  flutter pub publish
  ```

- [ ] Production rollout
  - [ ] Deploy backend first
  - [ ] Monitor Mathpix API costs
  - [ ] Deploy frontend in next release
  - [ ] Enable feature flag

---

## Code Examples for Common Tasks

### Backend: Extract Questions from PDF

```javascript
// In your handler function
const pdfService = new MathpixPdfService();
const mcqDetector = new MCQDetector();
const queueManager = new QuestionQueueManager();

// Upload PDF
const pdfId = await pdfService.submitPdfByBuffer(
  fileBuffer,
  'document.pdf',
  {conversionFormats: {docx: true}}
);

// Wait for processing
await pdfService.waitUntilComplete(pdfId, 600000);

// Get Markdown
const markdown = await pdfService.downloadAsMarkdown(pdfId);

// Extract questions
const questions = await mcqDetector.detectMultiple(markdown, markdown);

// Populate queue
const queueId = await queueManager.createSession(
  userId,
  questions,
  'pdf_extraction'
);

// Return to frontend
res.json({
  pdfId,
  questions,
  queueSessionId: queueId
});
```

### Frontend: Upload and Display Results

```dart
// In QuestionProvider method
Future<void> uploadPdfAndExtract(File pdfFile) async {
  try {
    final result = await _apiService.uploadPdfAndExtractQuestions(
      pdfFile,
      onProgress: (progress) {
        notifyListeners(); // Update UI
      }
    );
    
    if (result != null) {
      final questions = result['questions'] as List;
      final queueId = result['queueSessionId'] as String;
      
      // Populate internal queue
      _queue.addAll(questions);
      _currentQueueIndex = 0;
      _queueSessionId = queueId;
      
      notifyListeners();
    }
  } catch (e) {
    _error = e.toString();
    notifyListeners();
  }
}
```

### API: Stream PDF Pages

```javascript
// Server-side streaming
app.get('/api/v1/pdf/stream/:pdfId', authMiddleware, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  await pdfService.streamPdfPages(
    req.params.pdfId,
    (page, pageNum) => {
      res.write(`data: ${JSON.stringify({page, pageNum})}\n\n`);
    },
    (error) => {
      res.write(`data: ${JSON.stringify({error})}\n\n`);
      res.end();
    }
  );
});

// Client-side consumption
const eventSource = new EventSource(`/api/v1/pdf/stream/${pdfId}`);
eventSource.onmessage = (e) => {
  const {page, pageNum} = JSON.parse(e.data);
  console.log(`Received page ${pageNum}`);
};
```

---

## Debugging & Troubleshooting

### Common Issues & Solutions

#### Issue: "MATHPIX_APP_ID not found"
```javascript
// Check environment variables
console.log(process.env.MATHPIX_APP_ID);
console.log(process.env.MATHPIX_APP_KEY);

// Verify .env file
cat .env | grep MATHPIX
```

#### Issue: "File too large"
```javascript
// Set maximum file size
const upload = multer({ 
  limits: { fileSize: 104857600 } // 100MB
});

// Check file size before upload
if (req.file.size > MAX_SIZE) {
  return res.status(413).json({ error: 'File too large' });
}
```

#### Issue: "Timeout after 600s"
```javascript
// Increase timeout for large PDFs
const result = await pdfService.waitUntilComplete(
  pdfId,
  1200000 // 20 minutes
);

// Or implement streaming for progress
await pdfService.streamPdfPages(pdfId, ...);
```

#### Issue: "Questions not extracted"
```javascript
// Check raw Markdown output
const markdown = await pdfService.downloadAsMarkdown(pdfId);
console.log(markdown); // Inspect content

// Verify MCQDetector is working
const questions = await mcqDetector.detectMultiple(markdown, markdown);
console.log('Detected questions:', questions.length);

// Check confidence scores
questions.forEach(q => {
  console.log(`Q: ${q.questionText} (confidence: ${q.confidence})`);
});
```

### Debug Logging

**Enable verbose logging:**
```javascript
// In server.js
process.env.DEBUG = 'mathpix:*,pdf:*';

// In mathpixPdfService.js
if (process.env.DEBUG?.includes('mathpix')) {
  console.log(`[Mathpix] ${message}`);
}
```

**Flutter debug logging:**
```dart
// In question_provider.dart
import 'package:flutter/foundation.dart';

debugPrint('[QuestionProvider] PDF upload progress: $progress');
```

### Testing Strategy

**Unit Tests:**
```javascript
describe('MathpixPdfService', () => {
  it('should submit PDF', async () => {
    const pdfId = await service.submitPdfByBuffer(buffer, 'test.pdf');
    expect(pdfId).toBeDefined();
    expect(pdfId.length).toBeGreaterThan(0);
  });
  
  it('should timeout if not completed', async () => {
    await expect(
      service.waitUntilComplete('fake_id', 1000)
    ).rejects.toThrow('Timeout');
  });
});
```

**Integration Tests:**
```dart
testWidgets('PDF picker widget test', (WidgetTester tester) async {
  await tester.pumpWidget(const MyApp());
  
  // Find PDF button
  final pdfButton = find.byIcon(Icons.description_outlined);
  expect(pdfButton, findsOneWidget);
  
  // Tap and verify
  await tester.tap(pdfButton);
  await tester.pumpAndSettle();
  
  expect(find.byType(PdfPickerWidget), findsOneWidget);
});
```

---

## Mathpix API Reference (Key Details)

### Endpoints

| Endpoint | Method | Purpose | Async |
|----------|--------|---------|-------|
| `/v3/pdf` | POST | Submit PDF | Yes |
| `/v3/pdf/{pdf_id}` | GET | Get status | No |
| `/v3/pdf/{pdf_id}/stream` | GET | Stream pages | Yes |
| `/v3/pdf/{pdf_id}/convert/{format}` | GET | Download format | No |
| `/v3/pdf/{pdf_id}` | DELETE | Delete PDF | No |

### Request Headers

```
Authorization: Basic base64(app_id:app_key)
Content-Type: multipart/form-data  (for file uploads)
Content-Type: application/json      (for URL submissions)
```

### Response Status Codes

| Code | Status | Meaning |
|------|--------|---------|
| 200 | OK | Success |
| 202 | Accepted | Processing (async) |
| 400 | Bad Request | Invalid file |
| 401 | Unauthorized | Bad credentials |
| 429 | Too Many Requests | Rate limited |
| 500 | Server Error | Mathpix API error |

### PDF Status Response

```json
{
  "status": "processing",           // "processing", "completed", "failed"
  "num_pages": 12,
  "num_pages_completed": 8,
  "percent_done": 66.67,
  "current_page_processing": 9,
  "generated_at": 1234567890,
  "conversion": {
    "docx": {"status": "completed"},
    "html": {"status": "processing"},
    "latex": {"status": "queued"}
  }
}
```

---

## Performance Optimization Tips

### Backend Optimization

1. **Implement Caching**
```javascript
const cache = new Map(); // Or use Redis

// Cache PDF results for 1 hour
if (cache.has(pdfId)) {
  return cache.get(pdfId);
}

const result = await pdfService.downloadAsMarkdown(pdfId);
cache.set(pdfId, result);
setTimeout(() => cache.delete(pdfId), 3600000);
```

2. **Batch Processing**
```javascript
// Process multiple PDFs in parallel
const results = await Promise.all(
  pdfs.map(pdf => pdfService.submitPdfByBuffer(pdf))
);
```

3. **Streaming Large Results**
```javascript
// Instead of buffering entire Markdown
res.type('text/plain');
const stream = await pdfService.streamResult(pdfId);
stream.pipe(res);
```

### Frontend Optimization

1. **Lazy Load Widgets**
```dart
// Only build PDF picker when needed
if (_showPdfPicker) {
  return PdfPickerWidget(...);
}
```

2. **Progress Indication**
```dart
LinearProgressIndicator(
  value: uploadProgress,
  minHeight: 4,
)
```

3. **Cancel Long Operations**
```dart
// Allow user to cancel extraction
_cancellationToken = CancelToken();

try {
  await uploadPdfAndExtractQuestions(file);
} on DioException catch (e) {
  if (e.type == DioExceptionType.cancel) {
    // User cancelled
  }
}
```

---

## Cost Analysis

### Mathpix API Pricing

**Per-page processing cost:** ~$0.05-0.20 depending on complexity

| Scenario | Pages | Est. Cost |
|----------|-------|-----------|
| Single worksheet | 2 | $0.10-0.40 |
| Chapter | 20 | $1.00-4.00 |
| Textbook | 300 | $15.00-60.00 |
| School's annual usage (10k pages) | 10000 | $500-2000 |

**Ways to Reduce Cost:**

1. **Quality Filtering**
   - Only process images with confidence > 80%
   - Skip already-processed content

2. **Batch Processing**
   - 10% discount for batch uploads
   - Process overnight when cheaper

3. **Format Selection**
   - Only request formats needed
   - Skip expensive conversions (PPTX, LaTeX)

4. **Page Limits**
   - Allow users to select page ranges
   - Skip cover pages, indices, etc.

---

## Deployment Considerations

### Environment Variables Required

```bash
# Production
MATHPIX_APP_ID=prod_app_id
MATHPIX_APP_KEY=prod_app_key
PDF_PROCESSING_TIMEOUT=600000
PDF_MAX_FILE_SIZE=104857600
ENVIRONMENT=production

# Staging
MATHPIX_APP_ID=staging_app_id
MATHPIX_APP_KEY=staging_app_key
ENVIRONMENT=staging

# Development
DEBUG=mathpix:*,pdf:*
```

### Docker Configuration

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY src ./src

# Set limits
ENV NODE_OPTIONS="--max-old-space-size=2048"

EXPOSE 5000

CMD ["node", "src/server.js"]
```

### Health Check

```javascript
app.get('/health/pdf', (req, res) => {
  res.json({
    status: 'ok',
    service: 'pdf',
    mathpixConnected: await checkMathpixConnection(),
    uptime: process.uptime()
  });
});
```

### Monitoring

Track these metrics:
- PDF processing success rate (target: >95%)
- Average processing time per page (target: <5s)
- API cost per question extracted (target: <$0.20)
- User error rate (target: <5%)

---

## FAQ for Future Implementations

**Q: Can I process scanned handwritten PDFs?**  
A: Yes! Mathpix's OCR handles handwriting excellently. Just ensure image quality is good (300+ DPI).

**Q: What if PDF has equations?**  
A: Perfect use case. Mathpix preserves LaTeX. Equations stay in question text.

**Q: Can I convert DOCX to other formats?**  
A: Yes, submit DOCX file to `/v3/pdf` endpoint. Mathpix treats it like PDF.

**Q: Is there a webhook for completion instead of polling?**  
A: Not officially, but you can stream results in real-time using SSE.

**Q: How do I handle very large PDFs (500+ pages)?**  
A: Use page range parameter or split into sections. Streaming recommended.

**Q: Can I use Mathpix API without backend?**  
A: Not recommended. Backend handles secrets, rate limiting, format conversion.

**Q: What if OCR fails on a page?**  
A: Mathpix returns confidence score. Skip pages < threshold or manual review.

**Q: How long are PDF results stored?**  
A: Mathpix stores for ~30 days. Download ASAP or save to your database.

---

## Continuation Guide

### For Next AI Implementation

If you're implementing this in a different codebase:

1. **Read this document first** (you're here!)
2. **Review [MATHPIX_PDF_IMPLEMENTATION.md](./MATHPIX_PDF_IMPLEMENTATION.md)** for detailed API specs
3. **Copy backend files** in this order:
   - `mathpixPdfService.js` (service layer)
   - `pdfController.js` (business logic)
   - `pdfRoutes.js` (endpoints)
4. **Update server.js** (3 lines added)
5. **Copy Flutter files** in this order:
   - `pdf_picker_widget.dart` (UI)
   - Update `api_service.dart` (HTTP)
   - Update `question_provider.dart` (state)
   - Update `create_question_screen.dart` (integration)
6. **Test with sample PDF** before production
7. **Monitor costs** first week

### Support Resources

- **Mathpix API Docs:** https://mathpix.com/docs/api-reference/pdf-api
- **Implementation Reference:** This document + MATHPIX_PDF_IMPLEMENTATION.md
- **Code Examples:** Available in `/src/` and `/lib/`
- **Error Resolution:** See "Troubleshooting" section above

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | May 20, 2026 | Initial implementation |
| — | — | — |

---

## License & Attribution

This implementation uses:
- **Mathpix API v3** (requires API key from mathpix.com)
- **Open Source Libraries:** Flutter, Express.js, Node.js
- **Standard OCR Techniques** (multi-question detection algorithm)

---

**Document Owner:** Development Team  
**Last Updated:** May 20, 2026  
**For Questions:** Refer to MATHPIX_PDF_IMPLEMENTATION.md or contact team
