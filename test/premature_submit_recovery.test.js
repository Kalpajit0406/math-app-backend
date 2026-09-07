const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config({ path: 'E:/MathswithSD/MathswithSD/math-app-backend/.env' });
const connectDB = require('../src/config/db');
const Attempt = require('../src/models/attemptModel');
const Exam = require('../src/models/examModel');
const Student = require('../src/models/studentModel');
const attemptService = require('../src/services/attemptService');
const mongoose = require('mongoose');

test('Premature empty auto-submit recovery in attemptService', async (t) => {
  await connectDB();

  const testStudentId = new mongoose.Types.ObjectId();
  const testQuestionId = new mongoose.Types.ObjectId();
  const testQuestion2Id = new mongoose.Types.ObjectId();

  const exam = await Exam.create({
    title: 'Recovery Test Exam',
    classNo: 10,
    language: 'English',
    date: '2026-09-07',
    time: '10:00 AM',
    duration: 60,
    marksPerQuestion: 2,
    negativeMarking: 0.5,
    questions: [
      {
        _id: testQuestionId,
        questionText: 'What is 2 + 2?',
        options: ['2', '3', '4', '5'],
        correctAnswer: '4',
        marks: 2,
      },
      {
        _id: testQuestion2Id,
        questionText: 'What is 3 * 3?',
        options: ['6', '8', '9', '12'],
        correctAnswer: '9',
        marks: 2,
      }
    ],
  });

  const student = await Student.create({
    _id: testStudentId,
    name: 'Test Recovery Student',
    studentPhone: '9999888877',
    classNo: 10,
    isJoint: false,
    verified: true,
  });

  const attempt = await Attempt.create({
    userId: testStudentId,
    examId: exam._id,
    startTime: new Date(),
    questionOrder: [testQuestionId.toString(), testQuestion2Id.toString()],
  });

  await t.test('1. Premature auto-submit with 0 responses marks attempt as ended', async () => {
    // Simulate what checkForResumableExam did: empty payload auto-submit 1s after start
    const autoSubmitted = await attemptService.submitAttempt(
      testStudentId,
      attempt._id,
      [], // 0 answers
      {
        isAutoSubmitted: true,
        autoSubmitReason: '⏰ Exam duration expired while app was closed.',
      }
    );

    assert.ok(autoSubmitted.endTime, 'endTime must be set');
    assert.equal(autoSubmitted.isAutoSubmitted, true);
    assert.equal(autoSubmitted.responses.length, 0);
    assert.equal(autoSubmitted.score, 0);
  });

  await t.test('2. Student submits real answers within exam window - must recover and record answers', async () => {
    const recovered = await attemptService.submitAttempt(
      testStudentId,
      attempt._id,
      [
        { questionId: testQuestionId.toString(), userAnswer: '4' },
        { questionId: testQuestion2Id.toString(), userAnswer: '9' },
      ],
      {
        isAutoSubmitted: false,
      }
    );

    assert.equal(recovered.responses.length, 2, 'Must record 2 responses');
    assert.equal(recovered.responses[0].userAnswer, '4');
    assert.equal(recovered.responses[1].userAnswer, '9');

    // Fetch fresh from DB to verify persistence
    const inDb = await Attempt.findById(attempt._id);
    assert.equal(inDb.responses.length, 2);
    assert.equal(inDb.responses[0].userAnswer, '4');
    assert.equal(inDb.responses[1].userAnswer, '9');
  });

  await t.test('3. Subsequent submit on already-answered attempt remains idempotent', async () => {
    const idempotentResult = await attemptService.submitAttempt(
      testStudentId,
      attempt._id,
      [
        { questionId: testQuestionId.toString(), userAnswer: 'wrong_answer' },
      ],
      {}
    );

    // Responses must not have changed to the wrong answer
    assert.equal(idempotentResult.responses.length, 2);
    assert.equal(idempotentResult.responses[0].userAnswer, '4');
    assert.equal(idempotentResult.responses[1].userAnswer, '9');
  });

  // Cleanup
  await Attempt.deleteMany({ examId: exam._id });
  await Exam.deleteOne({ _id: exam._id });
  await Student.deleteOne({ _id: testStudentId });
});
