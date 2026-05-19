# Mathpix PDF Integration - Quick Reference Guide

**For:** Quick lookup and troubleshooting  
**Updated:** May 20, 2026

---

## 🚀 Quick Start (Copy-Paste Ready)

### Backend: Add PDF Support (3 minutes)

```javascript
// 1. Import in server.js (line ~50)
const pdfRoutes = require('./routes/pdfRoutes');

// 2. Add rate limiter
const authOcrLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50
});
app.use('/api/v1/pdf', authOcrLimiter);

// 3. Mount routes
app.use('/api/v1/pdf', pdfRoutes);

// 4. Set env vars
MATHPIX_APP_ID=your_id
MATHPIX_APP_KEY=your_key
```

### Frontend: Add PDF Picker (1 minute)

```dart
// 1. Import in create_question_screen.dart
import 'widgets/pdf_picker_widget.dart';

// 2. Add state variable
bool _showPdfPicker = false;

// 3. Add button in _buildInitialScanView()
ElevatedButton(
  onPressed: () => setState(() => _showPdfPicker = true),
  child: const Text('Upload PDF/Document')
)

// 4. Show widget when _showPdfPicker is true
if (_showPdfPicker)
  PdfPickerWidget(onQuestionsExtracted: (q, s) { /* handle */ })
```

---

## 📋 7 API Endpoints (Cheat Sheet)

| # | Endpoint | Method | Use Case |
|---|----------|--------|----------|
| 1 | `/pdf/scan` | POST | Upload PDF file |
| 2 | `/pdf/scan-url` | POST | Submit PDF by URL |
| 3 | `/pdf/status/:id` | GET | Check progress |
| 4 | `/pdf/download/:id/:fmt` | GET | Download result |
| 5 | `/pdf/extract-questions` | POST | Extract questions |
| 6 | `/pdf/stream/:id` | GET | Stream pages (SSE) |
| 7 | `/pdf/:id` | DELETE | Delete PDF |

---

## 💻 Code Snippets (Ready to Use)

### Upload PDF & Extract Questions (Backend)

```javascript
const pdfService = new MathpixPdfService();

// Step 1: Submit
const pdfId = await pdfService.submitPdfByBuffer(fileBuffer, 'doc.pdf');

// Step 2: Wait
await pdfService.waitUntilComplete(pdfId);

// Step 3: Download
const markdown = await pdfService.downloadAsMarkdown(pdfId);

// Step 4: Extract
const questions = await mcqDetector.detectMultiple(markdown, markdown);

// Step 5: Return
res.json({ pdfId, questions });
```

### Upload PDF & Extract (Flutter)

```dart
// Single call
final result = await provider.uploadPdfAndExtractQuestions(
  pdfFile,
  onProgress: (progress) => print('${(progress*100).toInt()}%')
);

// Access results
List<Question> questions = result['questions'];
String sessionId = result['queueSessionId'];
```

### Check PDF Status

```bash
# Bash
curl http://localhost:5000/api/v1/pdf/status/pdf_id \
  -H "Authorization: Bearer token"

# Dart
final status = await provider.getPdfStatus(pdfId);
print('${status['percentDone']}% complete');
```

### Download Result in Format

```javascript
// Markdown
const md = await pdfService.downloadAsMarkdown(pdfId);

// Word document
const docx = await pdfService.downloadResult(pdfId, 'docx');

// HTML
const html = await pdfService.downloadResult(pdfId, 'html');

// LaTeX
const tex = await pdfService.downloadResult(pdfId, 'latex');

// JSON with coordinates
const json = await pdfService.downloadAsLinesJson(pdfId);
```

### Stream Pages (Server-Sent Events)

```javascript
// Server
app.get('/api/v1/pdf/stream/:id', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  
  pdfService.streamPdfPages(
    req.params.id,
    (page) => res.write(`data: ${JSON.stringify(page)}\n\n`)
  );
});

// Client
const es = new EventSource('/api/v1/pdf/stream/pdf_id');
es.onmessage = (e) => console.log(JSON.parse(e.data));
```

---

## 🎯 File Reference

### Backend (Node.js/Express)
```
src/
├── services/mathpixPdfService.js     (650 lines) ← All API logic
├── controllers/pdfController.js      (450 lines) ← HTTP handlers
├── routes/pdfRoutes.js               (200 lines) ← Route definitions
└── server.js                         (modified +5) ← Integration
```

### Frontend (Flutter/Dart)
```
lib/
├── widgets/pdf_picker_widget.dart           (500 lines) ← UI
├── providers/question_provider.dart         (enhanced)  ← State
├── services/api_service.dart                (enhanced)  ← HTTP
└── screens/admin/create_question_screen.dart(modified) ← Integration
```

---

## ⚙️ Configuration

### Environment Variables (Copy This)
```bash
# Required
MATHPIX_APP_ID=your_app_id_here
MATHPIX_APP_KEY=your_app_key_here

# Optional (defaults shown)
PDF_PROCESSING_TIMEOUT=600000        # 10 minutes
PDF_MAX_FILE_SIZE=104857600          # 100 MB
PDF_POLLING_INTERVAL=1000            # 1 second
PDF_RATE_LIMIT=50                    # per 15 minutes
DEBUG=mathpix:*                      # verbose logging
```

### Dependencies (Add to package.json)
```json
{
  "dependencies": {
    "form-data": "^4.0.0",
    "multer": "^1.4.5-lts.1",
    "axios": "^1.3.0"
  }
}
```

### Flutter Dependencies (pubspec.yaml)
```yaml
dependencies:
  file_picker: ^5.0.0
  permission_handler: ^11.0.0
```

---

## 🐛 Troubleshooting Cheat Sheet

| Problem | Cause | Fix |
|---------|-------|-----|
| 401 Unauthorized | Bad API key | Check `MATHPIX_APP_ID` and `MATHPIX_APP_KEY` |
| 413 File too large | File > 100MB | Increase `PDF_MAX_FILE_SIZE` or split PDF |
| 429 Too many requests | Rate limit hit | Wait 15 min or increase `PDF_RATE_LIMIT` |
| Timeout after 600s | Processing slow | Increase `PDF_PROCESSING_TIMEOUT` |
| No questions found | Poor OCR | Check raw Markdown with `downloadAsMarkdown()` |
| File picker not showing | Permissions missing | Grant file/storage permissions |
| API returns 400 | Invalid PDF | Try with different PDF or format |
| Memory error | Large PDF buffering | Use streaming instead of buffering |

---

## 📊 Monitoring (What to Track)

```javascript
// Log successful extractions
console.log(`✅ Extracted ${questions.length} from PDF`);

// Log API costs
console.log(`💰 Cost estimate: $${numPages * 0.10}`);

// Log processing time
console.log(`⏱️ Processing took ${timeMs}ms`);

// Log errors
console.error(`❌ Failed: ${error.message}`);
```

---

## 🔐 Security Checklist

- [ ] JWT token required for all endpoints (authMiddleware)
- [ ] Rate limiting enabled (50 req/15min per API key)
- [ ] File size limits enforced (100MB max)
- [ ] Multipart uploads use memory (no disk temp files)
- [ ] API keys in environment variables (not in code)
- [ ] HTTPS required in production
- [ ] CORS configured properly
- [ ] Error messages don't leak sensitive info

---

## 🚀 Deployment Checklist

### Pre-deployment
- [ ] Environment variables set
- [ ] Dependencies installed (`npm install`)
- [ ] Tests passing (`npm test`)
- [ ] Mathpix API key valid
- [ ] Rate limits configured
- [ ] Error handling working

### Post-deployment
- [ ] API endpoints responding
- [ ] PDF upload working
- [ ] Questions extracted
- [ ] No errors in logs
- [ ] Monitor API costs
- [ ] Check success rate (target: >95%)

---

## 📱 User Features

### Teachers Can Now:
✅ Upload entire textbook PDF  
✅ Automatically extract all questions  
✅ Preview questions one-by-one  
✅ Edit if OCR has errors  
✅ Save to database  
✅ Auto-advance to next question  

### Supported Formats:
✅ PDF (.pdf)  
✅ Word (.docx, .doc)  
✅ PowerPoint (.pptx)  
✅ EPUB (.epub)  
✅ Pages (.pages)  

---

## 💡 Pro Tips

1. **Cache results** → Store Markdown for 1 hour to save API calls
2. **Stream for UX** → Use SSE streaming for real-time progress
3. **Batch processing** → Get 10% discount by processing multiple PDFs
4. **Page ranges** → Let users select specific pages to reduce cost
5. **Quality gates** → Skip extraction if confidence < 80%
6. **Async everywhere** → Always await PDF processing
7. **Error recovery** → Auto-retry with exponential backoff
8. **Monitor costs** → Track per-question extraction cost

---

## 📞 Support

### Quick Issues
| Issue | Resolution |
|-------|-----------|
| API not working | Check credentials in .env |
| No questions | Check raw Markdown output |
| Slow processing | Use streaming + async |
| High costs | Enable caching + page filtering |

### Full Documentation
- **Implementation Details:** `MATHPIX_PDF_IMPLEMENTATION.md`
- **Developer Guide:** `MATHPIX_PDF_DEVELOPER_GUIDE.md`
- **Mathpix API Docs:** https://mathpix.com/docs/api-reference/pdf-api

---

## ✅ Testing Commands

```bash
# Test backend endpoint
curl -X POST http://localhost:5000/api/v1/pdf/scan \
  -H "Authorization: Bearer token" \
  -F "file=@test.pdf"

# Test status check
curl http://localhost:5000/api/v1/pdf/status/pdf_id \
  -H "Authorization: Bearer token"

# Test download
curl http://localhost:5000/api/v1/pdf/download/pdf_id/mmd \
  -H "Authorization: Bearer token" > output.md

# Test Flutter widget
flutter test
```

---

## 🎓 Learning Path

**New to this codebase?** Follow this order:

1. Read this page (you're here!) - **5 min**
2. Read [MATHPIX_PDF_IMPLEMENTATION.md](./MATHPIX_PDF_IMPLEMENTATION.md) - **30 min**
3. Review backend files in `src/` - **30 min**
4. Review frontend files in `lib/` - **30 min**
5. Test with sample PDF - **15 min**
6. Deploy and monitor - **ongoing**

---

**Last Updated:** May 20, 2026  
**Status:** ✅ Production Ready  
**Version:** 1.0.0
