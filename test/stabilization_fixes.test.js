/**
 * Stabilization Fixes Test Suite
 * Tests Task 1 (Test Response Save Wipe Bug), Task 2 (Offline Sync End-to-End),
 * and Task 5 (/api/v1/tests Sanitized Metadata).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = require('../src/config/db');
const testResponseController = require('../src/controllers/testResponseController');
const attemptController = require('../src/controllers/attemptController');
const testConfigController = require('../src/controllers/testConfigController');

const TestResponse = require('../src/models/testResponseModel');
const Attempt = require('../src/models/attemptModel');
const TestConfig = require('../src/models/testConfigModel');
const Student = require('../src/models/studentModel');
const Class = require('../src/models/classModel');
const Exam = require('../src/models/examModel');
const Question = require('../src/models/questionModel');

function executeController(controller, req) {
  return new Promise((resolve, reject) => {
    const res = {};
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data) => {
      res.body = data;
      resolve(res);
    };
    const next = (err) => {
      if (err) reject(err);
      else resolve(res);
    };
    controller(req, res, next);
  });
}

test('Stabilization Fixes Integration Tests', async (t) => {
  // Establish connection before all tests
  if (mongoose.connection.readyState === 0) {
    await connectDB();
  }

  // Create common test objects
  const testMobile = '9999988888';
  let student;
  let classDoc;
  let testA;
  let testB;
  let examDoc;

  // Clean and seed DB
  await t.test('Seed test database models', async () => {
    // Cleanup
    await Student.deleteMany({ studentPhone: testMobile });
    await TestResponse.deleteMany({ studentMobile: testMobile });
    
    // Seed Class & Student
    classDoc = await Class.findOne({ classId: 10 }) || await Class.create({ classId: 10, className: 'Class 10' });
    
    student = await Student.create({
      firstName: 'Test',
      lastName: 'Student',
      studentPhone: testMobile,
      guardianPhone: '9999911111',
      language: 'English',
      password: 'password123',
      classId: classDoc._id,
      classNo: 10,
      isApproved: true,
      jwtVersion: 1
    });

    // Seed TestConfigs (with date in past)
    testA = await TestConfig.create({
      date: '2026-05-18',
      time: '10:00 AM',
      classId: classDoc._id,
      classNo: 10,
      language: 'English',
      totalMarks: 50,
      marksPQ: 5,
      timePQ: 30,
      negativeMarksPQ: 1,
      chapters: ['Algebra']
    });

    testB = await TestConfig.create({
      date: '2026-05-18',
      time: '11:00 AM',
      classId: classDoc._id,
      classNo: 10,
      language: 'English',
      totalMarks: 40,
      marksPQ: 4,
      timePQ: 30,
      negativeMarksPQ: 0,
      chapters: ['Geometry']
    });

    // Seed Questions
    const q1Doc = await Question.create({
      language: 'English',
      classId: classDoc._id,
      chapter: 'Algebra',
      correctAnswer: '4',
      options: ['3', '4', '5', '6'],
      question: 'What is 2+2?'
    });

    const q2Doc = await Question.create({
      language: 'English',
      classId: classDoc._id,
      chapter: 'Algebra',
      correctAnswer: '6',
      options: ['5', '6', '7', '8'],
      question: 'What is 3+3?'
    });

    // Seed Exam (with date in past)
    const examCreated = await Exam.create({
      title: 'Offline Sync Integration Exam',
      classNo: 10,
      language: 'English',
      date: '2026-05-18',
      time: '12:00 PM',
      totalQuestions: 2,
      totalTime: 60,
      marksPerQuestion: 4,
      negativeMarking: 1,
      questionIds: [q1Doc._id, q2Doc._id]
    });

    // Fetch populated examDoc
    examDoc = await Exam.findById(examCreated._id);
  });

  // ==================================================
  // TASK 1 — TEST RESPONSE SAVE WIPE BUG
  // ==================================================
  await t.test('Task 1: Save Test B response does not delete Test A response', async () => {
    const mockReqA = {
      user: { id: student._id },
      body: {
        date: '2026-05-18',
        time: '10:05 AM',
        studentMobile: testMobile,
        testId: testA._id.toString(),
        responses: [{ questionNumber: 1, questionId: 'q1', selectedOption: 'A' }]
      }
    };
    
    const mockResA = await executeController(testResponseController.saveStudentTest, mockReqA);
    assert.equal(mockResA.statusCode, 201);

    // Verify Test A response saved
    const respA = await TestResponse.findOne({ studentMobile: testMobile, testId: testA._id });
    assert.ok(respA, 'Test A response should exist');

    // Save Test B response
    const mockReqB = {
      user: { id: student._id },
      body: {
        date: '2026-05-18',
        time: '11:05 AM',
        studentMobile: testMobile,
        testId: testB._id.toString(),
        responses: [{ questionNumber: 1, questionId: 'q2', selectedOption: 'B' }]
      }
    };
    
    const mockResB = await executeController(testResponseController.saveStudentTest, mockReqB);
    assert.equal(mockResB.statusCode, 201);

    // Verify both Test A and Test B responses exist (Test A response NOT wiped!)
    const allResponses = await TestResponse.find({ studentMobile: testMobile });
    assert.equal(allResponses.length, 2, 'Should preserve both responses (no cross-test wipe)');

    // Retake Test B - Verify retake replaces B but keeps A
    const mockReqB2 = {
      user: { id: student._id },
      body: {
        date: '2026-05-18',
        time: '11:15 AM',
        studentMobile: testMobile,
        testId: testB._id.toString(),
        responses: [{ questionNumber: 1, questionId: 'q2', selectedOption: 'C' }]
      }
    };
    
    const mockResB2 = await executeController(testResponseController.saveStudentTest, mockReqB2);
    assert.equal(mockResB2.statusCode, 201);

    // Test A remains, Test B replaced
    const remainingA = await TestResponse.findOne({ studentMobile: testMobile, testId: testA._id });
    const remainingB = await TestResponse.findOne({ studentMobile: testMobile, testId: testB._id });
    
    assert.ok(remainingA, 'Test A should remain intact after Test B retake');
    assert.equal(remainingB.responses[0].selectedOption, 'C', 'Test B should be updated with new answer');
  });

  // ==================================================
  // TASK 2 — RESTORE OFFLINE SYNC
  // ==================================================
  await t.test('Task 2: syncOfflineAttempt end-to-end sync, scoring and idempotency', async () => {
    const q1 = examDoc.questions[0];
    const q2 = examDoc.questions[1];

    const mockReqSync = {
      user: { id: student._id.toString() },
      body: {
        examId: examDoc._id.toString(),
        responses: [
          { questionId: q1._id.toString(), selectedAnswer: '4' }, // Correct (Value '4' corresponds to correctAnswer '4')
          { questionId: q2._id.toString(), selectedAnswer: 'wrong' } // Incorrect
        ]
      }
    };

    const mockResSync = await executeController(attemptController.syncOfflineAttempt, mockReqSync);
    
    assert.equal(mockResSync.statusCode || 200, 200);
    const result = mockResSync.body;
    assert.ok(result.success);
    assert.ok(result.data);
    
    const attempt = result.data;
    assert.equal(attempt.score, 1, 'Should evaluate 1 correct answer');
    assert.equal(attempt.marksObtained, 3, 'Should score 3 marks (4 correct - 1 incorrect)');
    assert.ok(attempt.evaluationSummary, 'Should include evaluationSummary');
    assert.equal(attempt.evaluationSummary.correctQuestions, 1);
    assert.equal(attempt.evaluationSummary.incorrectQuestions, 1);

    // Verify idempotency: sync again does not create a duplicate attempt
    const mockResSync2 = await executeController(attemptController.syncOfflineAttempt, mockReqSync);
    
    assert.equal(mockResSync2.statusCode || 200, 200);
    const result2 = mockResSync2.body;
    assert.equal(result2.data._id.toString(), attempt._id.toString(), 'Should return existing attempt ID');
    
    const attemptsInDb = await Attempt.countDocuments({ userId: student._id, examId: examDoc._id });
    assert.equal(attemptsInDb, 1, 'Idempotency: Should only be 1 attempt in database');
  });

  // ==================================================
  // TASK 5 — HARDEN /api/v1/tests BEHAVIOR
  // ==================================================
  await t.test('Task 5: /api/v1/tests returns sanitized safe metadata only', async () => {
    const mockReqTests = {};
    const mockResTests = await executeController(testConfigController.getAllStudentTests, mockReqTests);
    
    assert.equal(mockResTests.statusCode, 200);
    const testsList = mockResTests.body;
    assert.ok(Array.isArray(testsList));
    
    for (const testItem of testsList) {
      // Allowed keys
      const allowed = ['id', 'date', 'time', 'classNo', 'language', 'totalMarks', 'marksPQ', 'timePQ', 'negativeMarksPQ', 'chapters'];
      const keys = Object.keys(testItem);
      
      for (const k of keys) {
        assert.ok(allowed.includes(k), `Field "${k}" should not be exposed in tests list`);
      }
      
      // Strict check for answers or internal DB state
      assert.equal(testItem.correctAnswer, undefined, 'Must not expose correctAnswer');
      assert.equal(testItem.isDeleted, undefined, 'Must not expose isDeleted');
      assert.equal(testItem.__v, undefined, 'Must not expose __v version key');
    }
  });

  // ==================================================
  // SELF ASSESSMENT QUESTION LIMIT VALIDATION
  // ==================================================
  await t.test('Self Assessment: limit parameter validation', async () => {
    const selfAssessmentController = require('../src/controllers/selfAssessmentController');
    
    // 1. Invalid limit should fail with 400
    const mockReqInvalid = {
      user: { id: student._id.toString() },
      body: {
        chapters: ['Algebra'],
        limit: 15, // Not in [5, 10, 20, 40]
        time: 30
      },
      headers: {}
    };
    
    const mockResInvalid = await executeController(selfAssessmentController.generateAssessment, mockReqInvalid);
    assert.equal(mockResInvalid.statusCode, 400);
    assert.ok(mockResInvalid.body.message.includes('INVALID_LIMIT'), 'Should reject limit of 15');

    // 2. Valid limit should succeed (if questions exist)
    // Note: Since chapters/questions might not be fully configured for student's class,
    // it might return NO_QUESTIONS, which also returns 400 but has message 'NO_QUESTIONS'.
    // If it succeeds, it returns 201. Both confirm limit validation was bypassed.
    const mockReqValid = {
      user: { id: student._id.toString() },
      body: {
        chapters: ['Algebra'],
        limit: 5, // Valid limit
        time: 30
      },
      headers: {}
    };
    
    const mockResValid = await executeController(selfAssessmentController.generateAssessment, mockReqValid);
    assert.ok([201, 400].includes(mockResValid.statusCode));
    if (mockResValid.statusCode === 400) {
      assert.ok(mockResValid.body.message.includes('NO_QUESTIONS'), 'If failed, should be due to no questions, not invalid limit');
    } else {
      assert.equal(mockResValid.statusCode, 201);
    }
  });

  // Clean up
  await t.test('Clean up database models', async () => {
    await Student.deleteMany({ studentPhone: testMobile });
    await TestResponse.deleteMany({ studentMobile: testMobile });
    await Attempt.deleteMany({ userId: student._id });
    await TestConfig.findByIdAndDelete(testA._id);
    await TestConfig.findByIdAndDelete(testB._id);
    if (examDoc) {
      await Question.deleteMany({ _id: { $in: examDoc.questionIds } });
      await Exam.findByIdAndDelete(examDoc._id);
    }
    
    const SelfAssessmentUsage = require('../src/models/selfAssessmentUsageModel');
    const SelfAssessmentSession = require('../src/models/selfAssessmentSessionModel');
    await SelfAssessmentUsage.deleteMany({ studentId: student._id });
    await SelfAssessmentSession.deleteMany({ studentId: student._id });

    await mongoose.connection.close();
  });
});
