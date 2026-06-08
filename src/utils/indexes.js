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

    // Student indexes
    await safeCreateIndex(Student.collection, { studentPhone: 1 }, { unique: true });
    await safeCreateIndex(Student.collection, { role: 1 });
    await safeCreateIndex(Student.collection, { classNo: 1 });
    await safeCreateIndex(Student.collection, { createdAt: -1 });
    console.log('✓ Student indexes created');

    // Question indexes
    await safeCreateIndex(Question.collection, { classNo: 1, chapterId: 1 });
    await safeCreateIndex(Question.collection, { language: 1 });
    await safeCreateIndex(Question.collection, { createdAt: -1 });
    await safeCreateIndex(Question.collection, { classNo: 1, language: 1 });
    await safeCreateIndex(Question.collection, { chapterId: 1 });
    console.log('✓ Question indexes created');

    // Class indexes
    await safeCreateIndex(Class.collection, { classId: 1 }, { unique: true });
    console.log('✓ Class indexes created');

    // Chapter indexes
    await safeCreateIndex(Chapter.collection, { classId: 1, normalizedChapterName: 1 }, { unique: true });
    await safeCreateIndex(Chapter.collection, { normalizedChapterName: 1 });
    console.log('✓ Chapter indexes created');

    // SyncVersion indexes
    await safeCreateIndex(SyncVersion.collection, { key: 1 }, { unique: true });
    console.log('✓ SyncVersion indexes created');

    // Exam indexes
    await safeCreateIndex(Exam.collection, { createdBy: 1 });
    await safeCreateIndex(Exam.collection, { classNo: 1 });
    await safeCreateIndex(Exam.collection, { createdAt: -1 });
    console.log('✓ Exam indexes created');

    // Attempt indexes
    await safeCreateIndex(Attempt.collection, { userId: 1, examId: 1 });
    await safeCreateIndex(Attempt.collection, { examId: 1 });
    await safeCreateIndex(Attempt.collection, { userId: 1 });
    await safeCreateIndex(Attempt.collection, { createdAt: -1 });
    await safeCreateIndex(Attempt.collection, { endTime: 1 }); // For finding submitted attempts
    console.log('✓ Attempt indexes created');

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
