/**
 * Database Indexes Configuration
 * Improves query performance significantly
 */

async function ensureIndexes(mongoose) {
  try {
    const Student = require('../models/studentModel');
    const Question = require('../models/questionModel');
    const Exam = require('../models/examModel');
    const Attempt = require('../models/attemptModel');

    // Student indexes
    await Student.collection.createIndex({ studentPhone: 1 }, { unique: true });
    await Student.collection.createIndex({ role: 1 });
    await Student.collection.createIndex({ classNo: 1 });
    await Student.collection.createIndex({ createdAt: -1 });
    console.log('✓ Student indexes created');

    // Question indexes
    await Question.collection.createIndex({ classNo: 1, chapter: 1 });
    await Question.collection.createIndex({ language: 1 });
    await Question.collection.createIndex({ createdAt: -1 });
    await Question.collection.createIndex({ classNo: 1, language: 1 });
    console.log('✓ Question indexes created');

    // Exam indexes
    await Exam.collection.createIndex({ createdBy: 1 });
    await Exam.collection.createIndex({ classNo: 1 });
    await Exam.collection.createIndex({ createdAt: -1 });
    console.log('✓ Exam indexes created');

    // Attempt indexes
    await Attempt.collection.createIndex({ userId: 1, examId: 1 });
    await Attempt.collection.createIndex({ examId: 1 });
    await Attempt.collection.createIndex({ userId: 1 });
    await Attempt.collection.createIndex({ createdAt: -1 });
    await Attempt.collection.createIndex({ endTime: 1 }); // For finding submitted attempts
    console.log('✓ Attempt indexes created');

    console.log('✓ All database indexes created successfully');
  } catch (error) {
    console.error('Error creating indexes:', error.message);
    // Don't throw - app can still work without indexes, just slower
  }
}

module.exports = { ensureIndexes };
