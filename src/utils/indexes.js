/**
 * Database Indexes Configuration
 * Improves query performance significantly
 */

function isIgnorableIndexError(error) {
  if (!error) return false;
  const message = String(error.message || '').toLowerCase();
  return (
    error.code === 85 ||
    error.codeName === 'IndexOptionsConflict' ||
    message.includes('already exists with a different name') ||
    message.includes('equivalent index already exists')
  );
}

async function safeCreateIndex(collection, key, options = {}) {
  try {
    await collection.createIndex(key, options);
  } catch (error) {
    if (isIgnorableIndexError(error)) {
      console.log(`- Skipping existing index ${JSON.stringify(key)}: ${error.message}`);
      return;
    }
    throw error;
  }
}

async function ensureIndexes(mongoose) {
  try {
    const Student = require('../models/studentModel');
    const Question = require('../models/questionModel');
    const Exam = require('../models/examModel');
    const Attempt = require('../models/attemptModel');
    const Class = require('../models/classModel');
    const Chapter = require('../models/chapterModel');
    const SyncVersion = require('../models/syncVersionModel');
    const VerificationSession = require('../models/verificationSessionModel');
    const VerificationSessionItem = require('../models/verificationSessionItemModel');
    const OcrArchive = require('../models/ocrArchiveModel');
    const OCRJob = require('../models/ocrJobModel');
    const Announcement = require('../models/announcementModel');
    const RateLimit = require('../models/rateLimitModel');
    const AuditLog = require('../models/auditLogModel');
    const AuthSession = require('../models/authSessionModel');
    const SystemMetrics = require('../models/systemMetricsModel');

    // Student indexes
    await safeCreateIndex(Student.collection, { studentPhone: 1 }, { unique: true });
    await safeCreateIndex(Student.collection, { fingerprintHash: 1 });
    await safeCreateIndex(Student.collection, { deviceFingerprint: 1 });
    await safeCreateIndex(Student.collection, { accountType: 1 });
    await safeCreateIndex(Student.collection, { accountStatus: 1 });
    await safeCreateIndex(Student.collection, { createdAt: -1 });
    console.log('✓ Student indexes created');

    // Question indexes
    try {
      await Question.collection.dropIndex('questionHash_1');
      console.log('✓ Dropped legacy/conflicting questionHash_1 index from questions');
    } catch (err) {}
    await safeCreateIndex(Question.collection, { questionHash: 1 }, { unique: true, sparse: true });
    await safeCreateIndex(Question.collection, { chapterId: 1 });
    await safeCreateIndex(Question.collection, { classId: 1 });
    await safeCreateIndex(Question.collection, { language: 1 });
    await safeCreateIndex(Question.collection, { classId: 1, language: 1 });
    await safeCreateIndex(Question.collection, { isDeleted: 1 });
    try {
      await Question.collection.dropIndex('QuestionTextSearchIndex');
      console.log('✓ Dropped legacy QuestionTextSearchIndex from questions');
    } catch (err) {}
    await safeCreateIndex(Question.collection, { question: 'text', formulaKeywords: 'text' }, { weights: { question: 10, formulaKeywords: 5 }, name: 'QuestionTextSearchIndex', language_override: 'none' });
    console.log('✓ Question indexes created');

    // Class indexes
    await safeCreateIndex(Class.collection, { classId: 1 }, { unique: true });
    console.log('✓ Class indexes created');

    // Chapter indexes
    // Note: Drop the legacy index first to avoid options conflicts
    try {
      await Chapter.collection.dropIndex('classId_1_normalizedChapterName_1');
      console.log('✓ Dropped legacy classId_1_normalizedChapterName_1 index from chapters');
    } catch (err) {}

    // Note: Use partial unique index for active chapters (isDeleted: false) to prevent name collisions on soft-deleted items
    try {
      await Chapter.collection.createIndex(
        { classId: 1, normalizedChapterName: 1 },
        { unique: true, partialFilterExpression: { isDeleted: false } }
      );
    } catch (err) {
      if (!isIgnorableIndexError(err)) throw err;
    }
    await safeCreateIndex(Chapter.collection, { normalizedChapterName: 1 });
    await safeCreateIndex(Chapter.collection, { isDeleted: 1 });
    console.log('✓ Chapter indexes created');

    // SyncVersion indexes
    await safeCreateIndex(SyncVersion.collection, { key: 1 }, { unique: true });
    console.log('✓ SyncVersion indexes created');

    // Exam indexes
    await safeCreateIndex(Exam.collection, { createdBy: 1 });
    await safeCreateIndex(Exam.collection, { classId: 1 });
    await safeCreateIndex(Exam.collection, { date: 1 });
    await safeCreateIndex(Exam.collection, { createdAt: -1 });
    await safeCreateIndex(Exam.collection, { isDeleted: 1 });
    console.log('✓ Exam indexes created');

    // Attempt indexes
    await safeCreateIndex(Attempt.collection, { userId: 1 });
    await safeCreateIndex(Attempt.collection, { examId: 1 });
    await safeCreateIndex(Attempt.collection, { startTime: 1 });
    await safeCreateIndex(Attempt.collection, { userId: 1, examId: 1 });
    await safeCreateIndex(Attempt.collection, { createdAt: -1 });
    console.log('✓ Attempt indexes created');

    // Verification Sessions indexes
    await safeCreateIndex(VerificationSession.collection, { sessionId: 1 }, { unique: true });
    await safeCreateIndex(VerificationSession.collection, { userId: 1 });
    await safeCreateIndex(VerificationSession.collection, { status: 1 });
    await safeCreateIndex(VerificationSession.collection, { expiresAt: 1 }, { expireAfterSeconds: 0 });
    console.log('✓ Verification Session indexes created');

    // Verification Session Item indexes
    await safeCreateIndex(VerificationSessionItem.collection, { sessionId: 1 });
    await safeCreateIndex(VerificationSessionItem.collection, { expiresAt: 1 }, { expireAfterSeconds: 0 });
    await safeCreateIndex(VerificationSessionItem.collection, { sessionId: 1, detectionOrder: 1 });
    console.log('✓ Verification Session Item indexes created');

    // OCRJob indexes
    await safeCreateIndex(OCRJob.collection, { expiresAt: 1 }, { expireAfterSeconds: 0 });
    await safeCreateIndex(OCRJob.collection, { status: 1 });
    await safeCreateIndex(OCRJob.collection, { availableAt: 1 });
    await safeCreateIndex(OCRJob.collection, { status: 1, availableAt: 1, createdAt: 1 });
    console.log('✓ OCRJob indexes created');

    // Announcement indexes
    await safeCreateIndex(Announcement.collection, { targetClassIds: 1 });
    await safeCreateIndex(Announcement.collection, { isDeleted: 1 });
    await safeCreateIndex(Announcement.collection, { targetClassIds: 1, isDeleted: 1 });
    console.log('✓ Announcement indexes created');

    // OcrArchive indexes
    await safeCreateIndex(OcrArchive.collection, { sessionId: 1 });
    await safeCreateIndex(OcrArchive.collection, { itemId: 1 });
    await safeCreateIndex(OcrArchive.collection, { createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
    console.log('✓ OcrArchive indexes created');

    // RateLimit indexes
    await safeCreateIndex(RateLimit.collection, { key: 1 }, { unique: true });
    await safeCreateIndex(RateLimit.collection, { expireAt: 1 }, { expireAfterSeconds: 0 });
    console.log('✓ RateLimit indexes created');

    // AuditLog indexes
    await safeCreateIndex(AuditLog.collection, { actorId: 1 });
    await safeCreateIndex(AuditLog.collection, { action: 1 });
    await safeCreateIndex(AuditLog.collection, { targetType: 1 });
    await safeCreateIndex(AuditLog.collection, { targetId: 1 });
    await safeCreateIndex(AuditLog.collection, { timestamp: -1 });
    console.log('✓ AuditLog indexes created');

    // AuthSession indexes
    await safeCreateIndex(AuthSession.collection, { userId: 1 });
    await safeCreateIndex(AuthSession.collection, { refreshTokenHash: 1 }, { unique: true });
    await safeCreateIndex(AuthSession.collection, { deviceFingerprint: 1 });
    try {
      await AuthSession.collection.dropIndex('expiresAt_1');
      console.log('✓ Dropped legacy expiresAt_1 index from authsessions');
    } catch (err) {}
    await safeCreateIndex(AuthSession.collection, { expiresAt: 1 }, { expireAfterSeconds: 0 });
    console.log('✓ AuthSession indexes created');

    // SystemMetrics indexes
    await safeCreateIndex(SystemMetrics.collection, { metricType: 1 });
    try {
      await SystemMetrics.collection.dropIndex('timestamp_1');
      console.log('✓ Dropped legacy timestamp_1 index from systemmetrics');
    } catch (err) {}
    await safeCreateIndex(SystemMetrics.collection, { timestamp: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });
    console.log('✓ SystemMetrics indexes created');

    // Drop legacy indexes
    try {
      await mongoose.connection.collection('studentperformances').dropIndex('studentMobile_1');
      console.log('✓ Dropped legacy studentMobile_1 index from studentperformances');
    } catch (err) {
      // Ignore if index doesn't exist
    }

    try {
      await Question.collection.dropIndex('classNo_1_chapter_1');
      console.log('✓ Dropped legacy classNo_1_chapter_1 index from questions');
    } catch (err) {
      // Ignore if index doesn't exist
    }

    console.log('✓ All database indexes created successfully');
  } catch (error) {
    console.error('Error creating indexes:', error.message);
    // Don't throw - app can still work without indexes, just slower
  }
}

module.exports = { ensureIndexes };
