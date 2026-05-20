require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./src/config/db');
const Student = require('./src/models/studentModel');
const User = require('./src/models/userModel');
const Exam = require('./src/models/examModel');
const Attempt = require('./src/models/attemptModel');
const Announcement = require('./src/models/announcementModel');
const Question = require('./src/models/questionModel');

const ensureIndexes = async () => {
  await Promise.all([
    Student.collection.createIndexes([
      { key: { studentPhone: 1 }, name: 'studentPhone_1', unique: true },
      { key: { role: 1, verified: 1, isRejected: 1 }, name: 'role_verified_rejected_1' },
      { key: { classNo: 1, language: 1 }, name: 'class_language_1' },
    ]),
    User.collection.createIndexes([
      { key: { email: 1 }, name: 'email_1', unique: true },
      { key: { role: 1 }, name: 'role_1' },
    ]),
    Exam.collection.createIndexes([
      { key: { createdBy: 1, createdAt: -1 }, name: 'createdBy_createdAt_1' },
      { key: { classNo: 1, language: 1 }, name: 'classNo_language_1' },
    ]),
    Attempt.collection.createIndexes([
      { key: { userId: 1, examId: 1, createdAt: -1 }, name: 'user_exam_createdAt_1' },
      { key: { examId: 1, score: -1 }, name: 'examId_score_leaderboard_1' },
      {
        key: { userId: 1, examId: 1 },
        name: 'unique_active_attempt_per_user_exam',
        unique: true,
        partialFilterExpression: { endTime: { $eq: null } },
      },
    ]),
    Announcement.collection.createIndexes([
      { key: { targetClass: 1, createdAt: -1 }, name: 'targetClass_createdAt_1' },
    ]),
    Question.collection.createIndexes([
      { key: { classNo: 1, language: 1, chapter: 1 }, name: 'class_language_chapter_1' },
      { key: { createdAt: -1 }, name: 'createdAt_desc_1' },
    ]),
  ]);
};

const normalizeData = async () => {
  const [studentRes, annRes] = await Promise.all([
    Student.updateMany(
      { $or: [{ verified: { $exists: false } }, { isRejected: { $exists: false } }] },
      [{ $set: { 
        verified: { $ifNull: ['$verified', false] }, 
        isRejected: { $ifNull: ['$isRejected', false] } 
      } }],
      { updatePipeline: true },
    ),
    Announcement.updateMany(
      { $or: [{ targetClass: null }, { targetClass: '' }, { targetClass: { $exists: false } }] },
      { $set: { targetClass: 'all' } },
    ),
  ]);

  return {
    studentsUpdated: studentRes.modifiedCount,
    announcementsUpdated: annRes.modifiedCount,
  };
};

const runAudit = async () => {
  const [studentsMissingPhone, studentsMissingPassword, examsNoQuestions, danglingAttempts] = await Promise.all([
    Student.countDocuments({ $or: [{ studentPhone: null }, { studentPhone: '' }, { studentPhone: { $exists: false } }] }),
    Student.countDocuments({ $or: [{ password: null }, { password: '' }, { password: { $exists: false } }] }),
    Exam.countDocuments({ $or: [{ questions: { $exists: false } }, { questions: { $size: 0 } }] }),
    Attempt.countDocuments({ $or: [{ userId: { $exists: false } }, { examId: { $exists: false } }] }),
  ]);

  console.log(
    JSON.stringify(
      {
        audit: {
          studentsMissingPhone,
          studentsMissingPassword,
          examsNoQuestions,
          danglingAttempts,
        },
      },
      null,
      2,
    ),
  );
};

const run = async () => {
  try {
    await connectDB();
    await ensureIndexes();
    const normalized = await normalizeData();
    console.log(JSON.stringify({ normalized }, null, 2));
    await runAudit();
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error(`DB optimization failed: ${error.message}`);
    await mongoose.connection.close();
    process.exit(1);
  }
};

run();
