const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
require('dotenv').config();
const mongoose = require('mongoose');

const BASE_URL = 'http://localhost:5000';
const STUDENT_PHONE = '6289855545';

async function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, body: data, headers: res.headers });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test('Exam Security Telemetry and Anti-Cheat API Verification', async (t) => {
  let token = '';
  let examId = '';
  let attemptId = '';

  // 1. Authenticate
  await t.test('Acquire auth token via student phone bypass', async () => {
    const res = await request('POST', '/api/v1/student/login', {
      studentPhone: STUDENT_PHONE,
      password: process.env.TEACHER_BYPASS_PASSWORD || 'admin123',
    });
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    token = body.data.accessToken;
  });

  // 2. Set up dummy exam configuration
  await t.test('Set up an exam config for attempt simulation', async () => {
    const res = await request(
      'POST',
      '/api/v1/tests/create',
      {
        classNo: '10',
        language: 'English',
        date: '2026-05-27',
        time: '12:00 PM',
        totalQuestions: 1,
        totalTime: 30,
        marksPerQuestion: 4,
        questions: [
          {
            question: 'DUMMY SECURE QUESTION ' + Date.now() + '?',
            options: ['A', 'B', 'C', 'D'],
            correctAnswer: 'A',
            language: 'English',
            classNo: 10,
            chapter: 'Security'
          }
        ]
      },
      { 'Authorization': `Bearer ${token}` }
    );
    assert.equal(res.status, 201);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    examId = body.data._id || body.data.id;
  });

  // 3. Start Exam Attempt
  await t.test('POST /api/v1/testResponse/start (Start attempt)', async () => {
    const res = await request(
      'POST',
      '/api/v1/testResponse/start',
      { examId },
      { 'Authorization': `Bearer ${token}` }
    );
    assert.equal(res.status, 201);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    attemptId = body.data._id || body.data.id;
  });

  // 4. Submit Exam Attempt with Violations and Security Alerts
  await t.test('POST /api/v1/testResponse/submit (Submit attempt with telemetry logs)', async () => {
    const res = await request(
      'POST',
      '/api/v1/testResponse/submit',
      {
        attemptId,
        responses: [],
        violations: [
          {
            type: 'appBackgrounded',
            severity: 'medium',
            message: 'Left app foreground (violation 1)',
            timestamp: new Date().toISOString()
          },
          {
            type: 'splitScreenDetected',
            severity: 'critical',
            message: 'Split screen mode detected',
            timestamp: new Date().toISOString()
          }
        ],
        isAutoSubmitted: true,
        autoSubmitReason: 'Split screen violation',
        emulatorDetected: false,
        rootDetected: true
      },
      { 'Authorization': `Bearer ${token}` }
    );
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    
    // Verify stored fields on response payload
    const attempt = body.data;
    assert.equal(attempt.isAutoSubmitted, true);
    assert.equal(attempt.autoSubmitReason, 'Split screen violation');
    assert.equal(attempt.rootDetected, true);
    assert.equal(attempt.emulatorDetected, false);
    assert.equal(attempt.violations.length, 2);
    assert.equal(attempt.violations[0].type, 'appBackgrounded');
    assert.equal(attempt.violations[1].type, 'splitScreenDetected');
  });

  // 5. Test Leaderboard UI Data
  await t.test('GET /api/v1/testResponse/leaderboard/:examId (Leaderboard check telemetry)', async () => {
    const res = await request(
      'GET',
      `/api/v1/testResponse/leaderboard/${examId}`,
      null,
      { 'Authorization': `Bearer ${token}` }
    );
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    const entry = body.data.find(e => (e._id || e.id) === attemptId);
    assert.ok(entry);
    assert.equal(entry.isAutoSubmitted, true);
    assert.equal(entry.rootDetected, true);
    assert.equal(entry.violations.length, 2);
  });

  // 6. Test Idempotent Submission
  await t.test('POST /api/v1/testResponse/submit (Submitting already submitted attempt should succeed)', async () => {
    const res = await request(
      'POST',
      '/api/v1/testResponse/submit',
      {
        attemptId,
        responses: []
      },
      { 'Authorization': `Bearer ${token}` }
    );
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
  });

  // 7. Test Server-side Timer and calculated remainingSeconds
  let examId2 = '';
  let attemptId2 = '';
  await t.test('Server-side timer calculations and startAttempt idempotency', async () => {
    // Create new exam
    const resCreate = await request(
      'POST',
      '/api/v1/tests/create',
      {
        classNo: '10',
        language: 'English',
        date: '2026-05-28',
        time: '12:00 PM',
        totalQuestions: 1,
        totalTime: 30, // 30 minutes = 1800 seconds
        marksPerQuestion: 4,
        questions: [
          {
            question: 'Timer test ' + Date.now() + '?',
            options: ['A', 'B', 'C', 'D'],
            correctAnswer: 'A',
            language: 'English',
            classNo: 10,
            chapter: 'Security'
          }
        ]
      },
      { 'Authorization': `Bearer ${token}` }
    );
    assert.equal(resCreate.status, 201);
    const bodyCreate = JSON.parse(resCreate.body);
    examId2 = bodyCreate.data._id || bodyCreate.data.id;

    // Start attempt 1st time
    const resStart = await request(
      'POST',
      '/api/v1/testResponse/start',
      { examId: examId2 },
      { 'Authorization': `Bearer ${token}` }
    );
    assert.equal(resStart.status, 201);
    const bodyStart = JSON.parse(resStart.body);
    assert.ok(bodyStart.success);
    assert.ok(bodyStart.data.remainingSeconds > 1790 && bodyStart.data.remainingSeconds <= 1800);
    attemptId2 = bodyStart.data._id || bodyStart.data.id;

    // Call startAttempt again (should return same active attempt with remainingSeconds)
    const resRestart = await request(
      'POST',
      '/api/v1/testResponse/start',
      { examId: examId2 },
      { 'Authorization': `Bearer ${token}` }
    );
    assert.equal(resRestart.status, 201);
    const bodyRestart = JSON.parse(resRestart.body);
    assert.ok(bodyRestart.success);
    assert.equal(bodyRestart.data._id || bodyRestart.data.id, attemptId2);
    assert.ok(bodyRestart.data.remainingSeconds > 1790 && bodyRestart.data.remainingSeconds <= 1800);
  });

  // 7b. Test boundary validation: too many questions requested should throw validation error
  await t.test('POST /api/v1/tests/create (insufficient questions count in database)', async () => {
    const res = await request(
      'POST',
      '/api/v1/tests/create',
      {
        classNo: '10',
        language: 'English',
        date: '2026-05-27',
        time: '12:00 PM',
        totalQuestions: 9999, // Impossibly large count
        totalTime: 30,
        marksPerQuestion: 4,
        chapters: ['Algebra']
      },
      { 'Authorization': `Bearer ${token}` }
    );
    assert.equal(res.status, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
    assert.ok(body.message.toLowerCase().includes('insufficient'));
  });

  // 7c. Test grading integrity: letter correct answer vs. student submitting option text
  await t.test('Grading Integrity: letter correct answer vs. student submitting option text', async () => {
    // We will create an exam with a question that has correctAnswer: 'B'
    const resCreate = await request(
      'POST',
      '/api/v1/tests/create',
      {
        title: 'Grading Integrity Test Exam',
        duration: 30,
        classNo: 10,
        language: 'English',
        questions: [
          {
            type: 'mcq',
            questionText: 'What is 1 + 1? ' + Date.now(),
            options: ['1', '2', '3', '4'],
            correctAnswer: 'B' // Correct answer is B, which corresponds to '2'
          }
        ]
      },
      { 'Authorization': `Bearer ${token}` }
    );
    assert.equal(resCreate.status, 201);
    const bodyCreate = JSON.parse(resCreate.body);
    const mockExamId = bodyCreate.data._id || bodyCreate.data.id;
    const questionId = bodyCreate.data.questions[0]._id || bodyCreate.data.questions[0].id;

    // Start attempt
    const resStart = await request(
      'POST',
      '/api/v1/testResponse/start',
      { examId: mockExamId },
      { 'Authorization': `Bearer ${token}` }
    );
    assert.equal(resStart.status, 201);
    const bodyStart = JSON.parse(resStart.body);
    const mockAttemptId = bodyStart.data._id || bodyStart.data.id;

    // Submit attempt with student choosing option text '2' (instead of B)
    const resSubmit = await request(
      'POST',
      '/api/v1/testResponse/submit',
      {
        attemptId: mockAttemptId,
        responses: [
          {
            questionId,
            userAnswer: '2' // The option text matching 'B'
          }
        ]
      },
      { 'Authorization': `Bearer ${token}` }
    );
    assert.equal(resSubmit.status, 200);
    const bodySubmit = JSON.parse(resSubmit.body);
    assert.ok(bodySubmit.success);
    // Student score should be 1 (graded correct because '2' corresponds to option 'B')
    assert.equal(bodySubmit.data.score, 1);

    // Clean up
    const connectDB = require('../src/config/db');
    if (mongoose.connection.readyState === 0) {
      await connectDB();
    }
    const Exam = require('../src/models/examModel');
    const Attempt = require('../src/models/attemptModel');
    await Attempt.findByIdAndDelete(mockAttemptId);
    await Exam.findByIdAndDelete(mockExamId);
  });

  // 8. Cleanup
  await t.test('Clean up created exam configurations and attempts', async () => {
    const connectDB = require('../src/config/db');
    if (mongoose.connection.readyState === 0) {
      await connectDB();
    }
    const Exam = require('../src/models/examModel');
    const Attempt = require('../src/models/attemptModel');
    
    await Attempt.findByIdAndDelete(attemptId);
    await Exam.findByIdAndDelete(examId);
    
    if (attemptId2) await Attempt.findByIdAndDelete(attemptId2);
    if (examId2) await Exam.findByIdAndDelete(examId2);
    
    await mongoose.disconnect();
  });
});
