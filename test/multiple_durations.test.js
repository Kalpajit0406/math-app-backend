const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();

// 1. Mock getRedisClient immediately to prevent real Redis socket connection
const redisConfig = require('../src/config/redis');
const mockStore = new Map();
const mockClient = {
  set: async (key, val, ...args) => {
    let nx = false;
    for (const arg of args) {
      if (arg === 'NX') nx = true;
    }
    if (nx && mockStore.has(key)) return null;
    mockStore.set(key, val);
    return 'OK';
  },
  get: async (key) => mockStore.get(key) || null,
  del: async (key) => { mockStore.delete(key); return 1; },
  on: () => {},
  emit: () => {},
};
redisConfig.getRedisClient = () => mockClient;

const mongoose = require('mongoose');

// Import models and controllers/services
const Student = require('../src/models/studentModel');
const Exam = require('../src/models/examModel');
const Question = require('../src/models/questionModel');
const Chapter = require('../src/models/chapterModel');
const Attempt = require('../src/models/attemptModel');
const attemptService = require('../src/services/attemptService');
const attemptController = require('../src/controllers/attemptController');

test('Multiple Exams with Different Durations Independent Evaluation Tests', async (t) => {
  // Connect via connectDB to ensure indexes are built, classes/chapters are seeded, and classCache is initialized
  const connectDB = require('../src/config/db');
  if (mongoose.connection.readyState === 0) {
    await connectDB();
  } else {
    const { initCache } = require('../src/utils/classCache');
    require('../src/models/classModel');
    await initCache();
  }

  // Create a mock student
  const studentPhone = '88888' + Math.floor(10000 + Math.random() * 90000);
  const student = new Student({
    firstName: 'Timer',
    lastName: 'Tester',
    classNo: 10,
    language: 'English',
    studentPhone,
    guardianPhone: '9876543210',
    password: 'password123',
    verified: true
  });
  console.log('[DEBUG] Saving student...');
  await student.save();
  const userId = student._id.toString();
  console.log('[DEBUG] Student saved. ID:', userId);

  // Create two exams:
  // Exam 1: Ends immediately (started in past, duration 1 minute)
  // Exam 2: Active (started now, duration 60 minutes)
  const pastDate = new Date();
  pastDate.setMinutes(pastDate.getMinutes() - 5); // 5 minutes ago

  const formatTimeStr = (date) => {
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    return `${hours}:${minutes} ${ampm}`;
  };

  const formatDateStr = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Create real questions in the database
  console.log('[DEBUG] Creating questions...');
  const q1 = await Question.create({
    question: 'What is 1+1? ' + Date.now(),
    options: ['1', '2', '3', '4'],
    correctAnswer: '2',
    language: 'English',
    classNo: 10,
    chapter: 'Arithmetic'
  });

  const q2 = await Question.create({
    question: 'What is 2+2? ' + Date.now(),
    options: ['2', '3', '4', '5'],
    correctAnswer: '4',
    language: 'English',
    classNo: 10,
    chapter: 'Arithmetic'
  });
  console.log('[DEBUG] Questions created.');

  const exam1 = new Exam({
    title: '10 Min Test Mock',
    classNo: 10,
    language: 'English',
    duration: 1, // 1 minute
    date: formatDateStr(pastDate),
    time: formatTimeStr(pastDate),
    questionIds: [q1._id]
  });
  console.log('[DEBUG] Saving exam 1...');
  await exam1.save();
  const exam1Id = exam1._id.toString();

  const exam2 = new Exam({
    title: '60 Min Test Mock',
    classNo: 10,
    language: 'English',
    duration: 60, // 60 minutes
    date: formatDateStr(new Date()),
    time: formatTimeStr(new Date()),
    questionIds: [q2._id]
  });
  console.log('[DEBUG] Saving exam 2...');
  await exam2.save();
  const exam2Id = exam2._id.toString();
  console.log('[DEBUG] Exams saved.');

  // Submit attempts for both exams
  console.log('[DEBUG] Starting attempts...');
  const attempt1 = await attemptService.startAttempt(userId, exam1Id);
  const attempt2 = await attemptService.startAttempt(userId, exam2Id);
  console.log('[DEBUG] Attempts started. ID1:', attempt1._id, 'ID2:', attempt2._id);

  // Submit correct answers for both
  console.log('[DEBUG] Submitting attempts...');
  const sub1 = await attemptService.submitAttempt(userId, attempt1._id, [
    { questionId: q1._id.toString(), userAnswer: '2' }
  ]);
  const sub2 = await attemptService.submitAttempt(userId, attempt2._id, [
    { questionId: q2._id.toString(), userAnswer: '4' }
  ]);
  console.log('[DEBUG] Attempts submitted.');

  await t.test('1. Verify initial database records', async () => {
    const a1 = await Attempt.findById(attempt1._id);
    const a2 = await Attempt.findById(attempt2._id);

    assert.ok(a1);
    assert.ok(a2);
    // Since exam2 starts now and has 60 min duration, it definitely hasn't ended yet
    assert.equal(a2.score, 0);
    assert.equal(a2.responses[0].isCorrect, null);
  });

  await t.test('2. Retrieve leaderboard for Exam 1 (ended) and verify auto-evaluation', async () => {
    const req = { params: { examId: exam1Id } };
    let jsonResponse = null;
    const res = {
      status: function(code) { this.statusCode = code; return this; },
      json: function(data) { jsonResponse = data; return this; }
    };

    await attemptController.getLeaderboard(req, res);
    assert.ok(jsonResponse);
    assert.equal(jsonResponse.success, true);
    
    // Attempt 1 should now be fully evaluated
    const a1 = await Attempt.findById(attempt1._id);
    assert.equal(a1.score, 1);
    assert.equal(a1.responses[0].isCorrect, true);

    const leader = jsonResponse.data.find(a => a._id.toString() === attempt1._id.toString());
    assert.ok(leader);
    assert.equal(leader.score, 1);
  });

  await t.test('3. Retrieve leaderboard for Exam 2 (active) and verify it remains unevaluated', async () => {
    const req = { params: { examId: exam2Id } };
    let jsonResponse = null;
    const res = {
      status: function(code) { this.statusCode = code; return this; },
      json: function(data) { jsonResponse = data; return this; }
    };

    await attemptController.getLeaderboard(req, res);
    assert.ok(jsonResponse);
    assert.equal(jsonResponse.success, true);
    
    // Attempt 2 should still be unevaluated because exam2 has not ended
    const a2 = await Attempt.findById(attempt2._id);
    assert.equal(a2.score, 0);
    assert.equal(a2.responses[0].isCorrect, null);

    const leader = jsonResponse.data.find(a => a._id.toString() === attempt2._id.toString());
    assert.ok(leader);
    assert.equal(leader.score, 0);
  });

  // Clean up
  await Student.findByIdAndDelete(userId);
  await Exam.findByIdAndDelete(exam1Id);
  await Exam.findByIdAndDelete(exam2Id);
  await Question.findByIdAndDelete(q1._id);
  await Question.findByIdAndDelete(q2._id);
  await Attempt.findByIdAndDelete(attempt1._id);
  await Attempt.findByIdAndDelete(attempt2._id);

  // Close connection
  await mongoose.connection.close();
});
