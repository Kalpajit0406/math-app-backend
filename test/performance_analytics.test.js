/**
 * Performance Analytics Test Suite
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

test('Student Performance Analytics Engine', async (t) => {
  // Connect to DB
  const connectDB = require('../src/config/db');
  if (mongoose.connection.readyState === 0) {
    await connectDB();
  }

  const Student = require('../src/models/studentModel');
  const StudentPerformance = require('../src/models/studentPerformanceModel');
  const PerformanceAnalytics = require('../src/services/performanceAnalyticsService');

  // Stub data
  const uniqueMobile = `199${Date.now()}`;
  let studentObj;

  await t.test('Set up test student profile', async () => {
    studentObj = await Student.create({
      firstName: 'Test',
      lastName: 'Student',
      classNo: 11,
      language: 'English',
      studentPhone: uniqueMobile,
      guardianPhone: uniqueMobile,
      password: 'password123'
    });
    assert.ok(studentObj._id);
    assert.equal(studentObj.studentPhone, uniqueMobile);
  });

  await t.test('Save first exam performance', async () => {
    const testId = new mongoose.Types.ObjectId().toString();
    const perf = await PerformanceAnalytics.savePerformance(uniqueMobile, testId, 'exam', 4, 5);
    
    assert.ok(perf);
    assert.equal(perf.studentMobile, uniqueMobile);
    assert.equal(perf.lastTestPercentage, 80);
    assert.equal(perf.totalTestsTaken, 1);
    assert.equal(perf.averagePercentage, 80);
    assert.equal(perf.testHistory.length, 1);
  });

  await t.test('Save second self-assessment performance (average and last calculation)', async () => {
    const testId = new mongoose.Types.ObjectId().toString();
    const perf = await PerformanceAnalytics.savePerformance(uniqueMobile, testId, 'self-assessment', 3, 5);
    
    assert.ok(perf);
    assert.equal(perf.lastTestPercentage, 60);
    assert.equal(perf.totalTestsTaken, 2);
    assert.equal(perf.averagePercentage, 70); // (80 + 60) / 2 = 70
    assert.equal(perf.testHistory.length, 2);
  });

  await t.test('Fetch performance mapping for student', async () => {
    const data = await PerformanceAnalytics.getStudentPerformance(studentObj._id.toString());
    
    assert.ok(data);
    assert.equal(data.totalAttempts, 2);
    assert.equal(data.completionRate, 100);
    assert.equal(data.accuracyRate, 70);
    assert.equal(data.averageScore, 70);
    assert.equal(data.lastTestPercentage, 60);
    assert.equal(data.recentAttempts.length, 2);
    assert.equal(data.recentAttempts[0].examTitle, 'Exam');
    assert.equal(data.recentAttempts[1].examTitle, 'Self Assessment');
  });

  // Clean up
  await Student.deleteOne({ _id: studentObj._id });
  await StudentPerformance.deleteOne({ studentMobile: uniqueMobile });
  await mongoose.connection.close();
});
