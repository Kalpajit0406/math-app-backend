const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();
const connectDB = require('../src/config/db');
const Attempt = require('../src/models/attemptModel');
const Exam = require('../src/models/examModel');
const Student = require('../src/models/studentModel');
const Question = require('../src/models/questionModel');
const attemptService = require('../src/services/attemptService');
const mongoose = require('mongoose');

test('Premature empty auto-submit recovery in attemptService', async (t) => {
  await connectDB();

  const testStudentId = new mongoose.Types.ObjectId();
  const timestamp = Date.now();

  const q1 = await Question.create({
    question: `What is 2 + 2? ${timestamp}`,
    options: ['2', '3', '4', '5'],
    correctAnswer: '4',
    language: 'English',
    classNo: 10,
    chapter: 'Arithmetic'
  });

  const q2 = await Question.create({
    question: `What is 3 * 3? ${timestamp}`,
    options: ['6', '8', '9', '12'],
    correctAnswer: '9',
    language: 'English',
    classNo: 10,
    chapter: 'Arithmetic'
  });

  const exam = await Exam.create({
    title: `Recovery Test Exam ${timestamp}`,
    classNo: 10,
    language: 'English',
    date: '2026-09-07',
    time: '10:00 AM',
    duration: 60,
    marksPerQuestion: 2,
    negativeMarking: 0.5,
    questionIds: [q1._id, q2._id],
  });

  const student = await Student.create({
    _id: testStudentId,
    name: 'Test Recovery Student',
    studentPhone: `99${String(timestamp).slice(-8)}`,
    classNo: 10,
    isJoint: false,
    verified: true,
  });

  const attempt = await Attempt.create({
    userId: testStudentId,
    examId: exam._id,
    startTime: new Date(),
    questionOrder: [q1._id.toString(), q2._id.toString()],
  });

  try {

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
        { questionId: q1._id.toString(), userAnswer: '4' },
        { questionId: q2._id.toString(), userAnswer: '9' },
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
        { questionId: q1._id.toString(), userAnswer: 'wrong_answer' },
      ],
      {}
    );

    // Responses must not have changed to the wrong answer
    assert.equal(idempotentResult.responses.length, 2);
    assert.equal(idempotentResult.responses[0].userAnswer, '4');
    assert.equal(idempotentResult.responses[1].userAnswer, '9');
  });
  } finally {
    // Cleanup
    await Attempt.deleteMany({ examId: exam._id });
    await Exam.deleteOne({ _id: exam._id });
    await Question.deleteMany({ _id: { $in: [q1._id, q2._id] } });
    await Student.deleteOne({ _id: testStudentId });
  }
});
