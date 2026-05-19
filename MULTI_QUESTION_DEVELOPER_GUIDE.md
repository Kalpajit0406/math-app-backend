# Multi-Question OCR System - Developer Quick Reference

## Backend API Usage

### Processing Multi-Question Images

```bash
# Original endpoint, now returns enhanced data
POST /api/v1/scan
Content-Type: multipart/form-data

Response:
{
  "success": true,
  "data": {
    "rawText": "raw OCR text",
    "latex": "sanitized LaTeX",
    "parsedQuestions": [
      {
        "question": "11. What is probability?",
        "options": [
          {"label": "A", "text": "0.5"},
          {"label": "B", "text": "0.3"},
          {"label": "C", "text": ""},
          {"label": "D", "text": ""}
        ],
        "format": "line-based",
        "questionNumber": "11",
        "detectionOrder": 1,
        "rawOcrData": {...},
        "verified": false
      },
      // Question 12, 13, etc...
    ],
    "confidence": 0.92,
    "qualityRating": "high",
    "detectionQuality": {
      "source": "latex",
      "multipleDetected": true,
      "questionCount": 3
    }
  }
}
```

### Backend Classes

```javascript
// Import from ocrPipeline.js
const { 
  QuestionNumberExtractor,
  MCQDetector,
  LatexSanitizer,
  QuestionQueueManager,
  OCRResultValidator,
  OCRPipeline
} = require('./ocrPipeline');

// Processing image buffer
const result = await OCRPipeline.runFromBuffer(buffer, mimetype, filename);
// Returns: { rawText, latex, parsedQuestions, confidence, qualityRating, detectionQuality }

// Legacy base64/URL support
const result = await OCRPipeline.run(base64OrUrl);

// Question queue management (optional server-side)
const queueMgr = new QuestionQueueManager();
queueMgr.storeQuestions(sessionId, questions, 3600); // 1 hour TTL
const current = queueMgr.getCurrentQuestion(sessionId);
queueMgr.nextQuestion(sessionId);
```

---

## Frontend Usage (Flutter)

### In Create Question Screen

```dart
// Automatically provided via Provider
final provider = Provider.of<QuestionProvider>(context);

// After scanning image, queue is automatically populated
// Access current question
final current = provider.currentQueueItem;

// Navigate queue
if (provider.hasNextQuestion) {
  provider.nextQuestion();
}

if (provider.hasPreviousQuestion) {
  provider.previousQuestion();
}

// Get progress
print(provider.queueProgress); // "3 of 7"
print(provider.remainingQuestions); // 5

// Mark as verified and move to next
provider.markCurrentAsVerified(moveNext: true);

// Save question (automatically marks verified + moves next)
await provider.saveQuestion(question, diagramFile: file);

// Recovery
provider.undoLastVerification();
```

### Using Queue UI Widgets

```dart
// Import the widgets
import '../../widgets/question_queue_status_widget.dart';

// Use in build method
QuestionQueueStatusWidget(
  onPrevious: () { /* handle */ },
  onNext: () { /* handle */ },
  onSkip: () { /* handle */ },
  onDelete: () { /* handle */ },
  showNavigationButtons: true,
  compact: false,
)

// Show all questions in expandable list
QueueSummaryWidget(
  onTap: (index) {
    provider.jumpToIndex(index);
  },
)
```

---

## Data Flow Diagrams

### Multi-Question Extraction Flow
```
Image (3 questions)
    ↓
[Mathpix API]
    ↓
raw_text + raw_latex
    ↓
[Sanitize LaTeX]
    ↓
[Split by question numbers]
    ↓
Question 1: "11. ..."
Question 2: "12. ..."
Question 3: "13. ..."
    ↓
[Detect MCQ options for each]
    ↓
Enriched Questions with metadata
    ↓
Return to frontend as array
    ↓
Frontend: Population queue
```

### Verification Workflow
```
Queue: [Q1, Q2, Q3, Q4]
Index: 0

Display Q1 in UI
User edits Q1
User clicks "Save & Next"
    ↓
Save Q1 to database
Mark Q1 as verified
Remove Q1 from queue
Set index = 0 (next item)
    ↓
Queue: [Q2, Q3, Q4]
Display Q2 in UI
...repeat...
```

### Recovery/Undo Flow
```
Verification History: [Q1_verified]
Current Queue: [Q2, Q3]
Index: 0

User clicks "Undo"
    ↓
Pop Q1 from history
Insert at queue[0]
Set index = 0
    ↓
Queue: [Q1, Q2, Q3]
Display Q1 (unverified)
User can re-edit/re-verify
```

---

## Common Scenarios

### Scenario 1: Scan 5-Question Page
```
1. Take photo of page with questions 11-15
2. Click "Scan"
   → Backend detects all 5 questions
   → Returns array of 5 ScanData items
3. Frontend displays Q11 with "1 of 5"
4. Teacher edits → saves
   → Auto-advances to Q12 (2 of 5)
5. Repeat for all 5 questions
6. Last question → shows "All done!"
```

### Scenario 2: Skip a Question
```
Currently on Q2 of 3
Click "Skip"
   → Confirm dialog shown
   → Q2 removed from queue
   → Shows Q3 (2 of 2 now)
```

### Scenario 3: Undo Verification
```
Saved Q1, moved to Q2
Realize Q1 had errors
Click "Undo" (if available)
   → Q1 restored to queue
   → Index goes back to 0
   → Can re-edit Q1
```

### Scenario 4: Low OCR Confidence
```
Scan image with poor lighting
Confidence score: 62%
   → Shows warning badge
   → Suggests manual review
Teacher can:
   - Accept and fix manually
   - Re-crop image and rescan
   - Skip to next question
```

---

## Error Handling

### Question Detection Failures
```dart
// If no questions detected
if (provider.questionQueue.isEmpty) {
  // Backend returns single item with full image text
  // Treat as one large question
  // User can split manually if needed
}
```

### LaTeX Rendering Issues
```dart
// If equation won't render
// Switch to "Readable Text" view
// Original LaTeX preserved in rawOcrData
// Can retry rendering or use as fallback
```

### Network Errors During Save
```dart
// If save fails mid-queue
final saved = await provider.saveQuestion(q);
if (!saved) {
  // Display error, retry option
  // Queue state preserved
  // Can retry without re-scanning
}
```

---

## Configuration & Tuning

### Backend Parameters

```javascript
// In ocrPipeline.js MCQDetector
// Question split regex (adjustable)
const splitRegex = /^(?:Question\s+\d+|...)/gm;

// Option detection order (line-based preferred)
// [MCQDetector.detect() → detectStructured → detectLine → detectInline]

// LaTeX sanitization (balancing tolerance)
const maxMissingBraces = 10; // Allow up to 10 unmatched
const maxMissingDollars = 1;  // Allow at most 1 unmatched
```

### Frontend Parameters

```dart
// In question_provider.dart
// Queue TTL (server-side, if implemented)
const defaultQueueTtl = 3600; // 1 hour

// Navigation mode (currently sequential, extensible)
_queueNavigationMode = QueueNavigationMode.sequential;

// History size (unlimited currently, could be capped)
final verificationHistory = [];
```

---

## Performance Considerations

### Memory Usage
```
Per Question (average):
  - questionText: 500 bytes
  - 4 options: 200 bytes
  - metadata: 100 bytes
  - rawOcrData: 3KB
  Total: ~4KB per question

Queue of 10 questions: ~40KB
Queue with history: ~80KB

Auto-cleanup after 1 hour → memory reclaimed
```

### Processing Speed
```
OCR extraction: 2-3 seconds (Mathpix API)
Question splitting: <100ms
LaTeX sanitization: <50ms
Option detection: <200ms per question
Total: ~3.5 seconds for 3 questions (Mathpix dominates)
```

### Scalability
```
Current (in-memory):
  - 100 concurrent users
  - 10 questions each
  - = 100KB total memory

For production scale (1000+ users):
  → Implement Redis queue backend
  → Database persistence
  → Async processing
```

---

## Debugging Tips

### Check Raw OCR Data
```dart
final current = provider.currentQueueItem;
final raw = current?.rawOcrData;
print(raw?['sourceUsed']); // "latex" or "rawText"
print(raw?['rawText']); // Original OCR text
print(raw?['confidence']); // OCR confidence score
```

### Verify Queue State
```dart
print(provider.queueProgress); // "3 of 7"
print(provider.currentQueueIndex); // 2 (0-based)
print(provider.hasNextQuestion); // true/false
print(provider.verificationHistoryLength); // Number of undos available
```

### Monitor LaTeX Issues
```dart
final current = provider.currentQueueItem;
print(current?.latex); // Check for balanced delimiters
print(current?.rawOcrData?['sanitizedLatex']); // After sanitization
```

---

## Future Enhancement Ideas

### Immediate (Next Sprint)
- [ ] Server-side queue persistence (Redis)
- [ ] Batch saving all questions at once
- [ ] Question preview thumbnails in queue summary

### Short-term (Next 2 Sprints)
- [ ] Per-option confidence scores
- [ ] Auto-correct common OCR mistakes
- [ ] Custom question number formats
- [ ] Image extraction from options

### Long-term (Next Quarter)
- [ ] ML-based answer validation
- [ ] Automatic difficulty assessment
- [ ] Question deduplication across uploads
- [ ] Multi-language question detection
- [ ] PDF page auto-splitting before OCR

---

## Support & Troubleshooting

### Questions not detected?
- Check OCR confidence (>70% recommended)
- Verify question numbering format matches patterns
- Try re-cropping image tighter
- Check raw OCR text in rawOcrData

### Options merging?
- Ensure clear separation between questions
- Check option formatting (must match: A), (B), etc.)
- Verify no special characters in option separators

### LaTeX not rendering?
- Switch to "Readable Text" view
- Check for unmatched $ or { }
- Use rawOcrData to see original LaTeX
- Consider manual correction

### Queue navigation broken?
- Clear queue and re-scan image
- Check QuestionProvider state via Provider DevTools
- Verify currentQueueIndex is 0-based
- Ensure provider notifyListeners() called

---

## Related Documentation
- `MULTI_QUESTION_IMPLEMENTATION.md` - Full technical documentation
- `ARCHITECTURE_DIAGRAMS.md` - System architecture overview
- `FLUTTER_ANALYSIS_INDEX.md` - Flutter codebase structure
