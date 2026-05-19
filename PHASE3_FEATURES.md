## MathswithSD Platform - Phase 3 Features Documentation

This document describes all new features added in Phase 3 implementation.

---

## Backend API Endpoints

### 1. Question Rating System (`/api/v1/ratings`)

#### POST `/api/v1/ratings/rate`
**Purpose:** Create or update a question rating after student answers

**Request Body:**
```json
{
  "questionId": "60f7b3c5d1a2b3c4d5e6f7a8",
  "difficulty": 3,           // 1-5 scale
  "clarity": 4,              // 1-5 scale (optional)
  "comment": "Hard to understand the wording",
  "isCorrectAnswer": true,   // boolean
  "timeSpent": 120           // seconds (optional)
}
```

**Response:**
```json
{
  "success": true,
  "message": "Question rated successfully",
  "data": { /* rating object */ }
}
```

**Auth:** Required (Bearer token)

---

#### GET `/api/v1/ratings/analytics/:questionId`
**Purpose:** Get aggregated analytics for a single question

**Response:**
```json
{
  "success": true,
  "data": {
    "questionId": "60f7b3c5d1a2b3c4d5e6f7a8",
    "totalRatings": 45,
    "averageDifficulty": 3.2,
    "averageClarity": 3.8,
    "successRate": 72.3,           // percentage
    "averageTimeSpent": 145,       // seconds
    "difficultyDistribution": {
      "1": 5,
      "2": 8,
      "3": 15,
      "4": 12,
      "5": 5
    }
  }
}
```

**Auth:** Required

---

#### GET `/api/v1/ratings/exam-analytics/:examId`
**Purpose:** Get analytics for all questions in an exam

**Response:**
```json
{
  "success": true,
  "examId": "exam123",
  "totalQuestions": 20,
  "analysedQuestions": 18,
  "data": [
    {
      "questionId": "q1",
      "totalRatings": 30,
      "averageDifficulty": 2.1,
      "successRate": 85.0
    },
    // ...more questions
  ]
}
```

**Auth:** Required

---

### 2. Student Performance Analytics (`/api/v1/analytics`)

#### GET `/api/v1/analytics/my-performance`
**Purpose:** Get current student's own performance data

**Response:**
```json
{
  "success": true,
  "data": {
    "studentId": "student123",
    "totalAttempts": 15,
    "completedAttempts": 14,
    "averageScore": 78.5,
    "totalQuestionsAnswered": 280,
    "accuracyRate": 72.3,
    "improvementTrend": 5.2,       // percentage (positive = improving)
    "performanceByChapter": {
      "Trigonometry": {
        "attempted": 45,
        "correct": 38,
        "accuracy": 84.4
      },
      "Geometry": {
        "attempted": 40,
        "correct": 28,
        "accuracy": 70.0
      }
    },
    "recentAttempts": [
      {
        "examId": "exam1",
        "score": 82,
        "date": "2024-01-15T10:30:00Z"
      }
    ]
  }
}
```

**Auth:** Required

---

#### GET `/api/v1/analytics/student/:studentId`
**Purpose:** Get specific student's performance (admin/teacher only)

**Same response as my-performance**

**Auth:** Required (admin/teacher role required)

---

#### GET `/api/v1/analytics/class/:classNo?language=en`
**Purpose:** Get class-wide performance analytics

**Response:**
```json
{
  "success": true,
  "data": {
    "classNo": 10,
    "totalStudents": 35,
    "activeStudents": 28,
    "classAverageScore": 73.4,
    "topPerformers": [
      { "averageScore": 92.5, "totalAttempts": 12 },
      { "averageScore": 89.3, "totalAttempts": 10 }
    ],
    "needsAttention": [
      { "averageScore": 45.2, "totalAttempts": 8 },
      { "averageScore": 52.1, "totalAttempts": 7 }
    ]
  }
}
```

**Auth:** Required (admin/teacher role required)

---

## Flutter Student App Features

### 1. Difficulty Badge Widget
**Location:** `lib/widgets/difficulty_badge.dart`

**Components:**
- `DifficultyBadge` - Full badge with detailed info
- `DifficultyIndicator` - Compact indicator for lists

**Usage:**
```dart
// Full badge
DifficultyBadge(
  difficulty: 3.2,
  successRate: 72.3,
  compact: false,
)

// Compact indicator
DifficultyIndicator(difficulty: 3.2)
```

**Colors:**
- Easy (1-1.5): Green
- Medium (1.5-2.5): Blue
- Hard (2.5-3.5): Amber
- Very Hard (3.5-4.5): Orange
- Expert (4.5-5): Red

---

### 2. Offline Exam Service
**Location:** `lib/services/offline_exam_service.dart`

**Usage Example:**
```dart
final offlineService = OfflineExamService();

// Save exam for offline use
await offlineService.saveExamOffline(OfflineExam(
  examId: 'exam123',
  title: 'Math Quiz',
  duration: 60,
  questions: [/* question list */],
  startedAt: DateTime.now(),
));

// Save a response
await offlineService.saveOfflineResponse(OfflineResponse(
  responseId: 'resp123',
  examId: 'exam123',
  questionId: 'q1',
  selectedAnswer: 'B',
  timeSpent: 45,
  answeredAt: DateTime.now(),
));

// Mark as completed and sync later
await offlineService.completeOfflineExam('exam123');

// Get unsynced exams
final unsyncedExams = await offlineService.getUnsyncedExams();
```

---

### 3. API Retry Methods
**Location:** `lib/services/api_service.dart`

**Available Methods:**
- `loginWithRetry(phone, password)` - 20s timeout
- `fetchExamsWithRetry()` - 15s timeout
- `startAttemptWithRetry(examId)` - 15s timeout
- `submitAnswersWithRetry(attemptId, answers)` - 30s timeout
- `getAnnouncementsWithRetry(targetClass)` - 15s timeout

**Retry Strategy:**
- Max 3 attempts
- Delays: 1s → 2s → 4s
- Automatic backoff on ApiException

**Usage:**
```dart
try {
  final exams = await apiService.fetchExamsWithRetry();
} on ApiException catch (e) {
  print('Failed after 3 attempts: ${e.message}');
}
```

---

## Flutter Admin App Features

### 1. Confidence Badge Widget
**Location:** `lib/widgets/confidence_badge.dart`

**Components:**
- `ConfidenceBadge` - Full badge with recommendations
- `ConfidenceIndicator` - Compact percentage display

**Usage:**
```dart
// Full badge
ConfidenceBadge(
  confidence: 87.5,
  compact: false,
)

// Compact
ConfidenceIndicator(confidence: 87.5)
```

**Confidence Levels:**
- 90-100%: Excellent (Green) - "Ready to use"
- 80-89%: Good (Blue) - "Review recommended"
- 70-79%: Fair (Amber) - "Please review"
- 60-69%: Poor (Orange) - "Manual correction needed"
- <60%: Very Poor (Red) - "Re-crop or re-upload recommended"

---

### 2. API Retry Methods (OCR-Enhanced)
**Location:** `lib/services/api_service.dart`

**Additional Methods:**
- `processOcrImageWithRetry(file)` - **60s timeout** (longer for OCR)
- `createQuestionWithRetry(question)`
- `loginWithRetry(phone, password)`
- `getQuestionsWithRetry(classNo, language)`
- `getAllTestsWithRetry()`
- `getAllStudentsWithRetry()`

---

## Integration Checklist

### Backend
- [x] Rating routes mounted at `/api/v1/ratings`
- [x] Analytics routes mounted at `/api/v1/analytics`
- [x] Auth middleware applied to all endpoints
- [x] Role-based authorization for admin endpoints
- [ ] Database indexes for analytics queries (ready from Phase 2)
- [ ] Rate limiting for analytics endpoints (optional)

### Student App
- [x] Difficulty badge widgets created
- [x] Offline exam service with SQLite
- [x] Retry methods in API service
- [ ] Integrate retry methods into actual API calls (NEXT)
- [ ] Display difficulty badges in exam preview
- [ ] Implement offline exam UI flow
- [ ] Add sync manager for offline exams

### Admin App
- [x] Confidence badge widget created
- [x] OCR retry methods implemented (60s timeout)
- [ ] Display confidence scores in OCR results
- [ ] Add re-crop/re-upload flow based on confidence
- [ ] Show success rate in question list

---

## Testing Guide

### 1. Rating System
```bash
# Create a rating
curl -X POST http://localhost:5000/api/v1/ratings/rate \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "questionId": "QUESTION_ID",
    "difficulty": 3,
    "isCorrectAnswer": true
  }'

# Get analytics
curl http://localhost:5000/api/v1/ratings/analytics/QUESTION_ID \
  -H "Authorization: Bearer TOKEN"
```

### 2. Analytics
```bash
# Get my performance
curl http://localhost:5000/api/v1/analytics/my-performance \
  -H "Authorization: Bearer TOKEN"

# Get class analytics (teacher)
curl http://localhost:5000/api/v1/analytics/class/10 \
  -H "Authorization: Bearer TOKEN"
```

### 3. Offline Exams
- Test saving exam locally
- Complete exam offline
- Simulate network reconnection
- Verify sync flow

### 4. Retry Logic
- Simulate network failures
- Verify backoff delays (1s, 2s, 4s)
- Check error messages after max attempts

---

## Performance Notes

### Database Optimization
- Question analytics queries: Use indexes on questionId, userId
- Class performance: Aggregate on userId, classNo
- Consider caching for frequently queried metrics

### Frontend Optimization
- Offline storage uses SQLite (efficient)
- Retry logic prevents duplicate submissions
- Difficulty badges are stateless widgets (efficient rendering)

### Network Optimization
- Longer OCR timeout (60s) for admin app
- Exponential backoff prevents server overload
- Rate limiting recommended for analytics endpoints

---

## Future Enhancements

1. **Caching Layer** - Cache frequently accessed analytics
2. **Real-time Notifications** - Alert on significant performance changes
3. **Batch Analytics** - Export class/student analytics as reports
4. **ML Predictions** - Predict student performance based on trends
5. **Question Bank** - Search/filter by difficulty and success rate
6. **Study Recommendations** - Suggest topics based on weak areas

---

## Support & Debugging

### Common Issues

**Q: Offline exams not syncing after internet returns**
A: Check `getUnsyncedExams()` status and call sync manager

**Q: OCR confidence always low**
A: Try longer timeout, ensure image quality, reduce crop area

**Q: Analytics queries slow**
A: Verify database indexes created, check connection pool

**Q: Retry methods still failing**
A: Check server logs for actual error, increase max attempts if needed

---

**Documentation Version:** 1.0 (Phase 3)
**Last Updated:** January 2024
