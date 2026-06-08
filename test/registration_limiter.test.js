const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();
const mongoose = require('mongoose');

// Connect to DB
const connectDB = require('../src/config/db');

// Import models and services
const Student = require('../src/models/studentModel');
const PhoneRecord = require('../src/models/phoneRecordModel');
const authService = require('../src/services/authService');
const authController = require('../src/controllers/authController');

test('Phone Registration Limiter and Blacklisting Integration Tests', async (t) => {
  if (mongoose.connection.readyState === 0) {
    await connectDB();
  }

  // Generate a random phone number to avoid collisions
  const testPhone = '99999' + Math.floor(10000 + Math.random() * 90000);
  let studentId = '';

  // Clean up any existing records for this number just in case
  await Student.deleteMany({ studentPhone: testPhone });
  await PhoneRecord.deleteMany({ phone: testPhone });

  const dummyStudentData = {
    firstName: 'Test',
    lastName: 'Limiter',
    classNo: 10,
    language: 'English',
    studentPhone: testPhone,
    guardianPhone: '9876543210',
    password: 'password123'
  };

  await t.test('1. First registration attempt: increases attemptCount to 1', async () => {
    const student = await authService.register(dummyStudentData);
    assert.ok(student._id);
    studentId = student._id.toString();

    const record = await PhoneRecord.findOne({ phone: testPhone });
    assert.ok(record);
    assert.equal(record.attemptCount, 1);
    assert.equal(record.blacklisted, false);
  });

  await t.test('2. Rejecting the student deletes or sets isRejected flag', async () => {
    // We mock/use controller rejectStudent logic directly
    const req = { body: { id: studentId } };
    let jsonResponse = null;
    const res = {
      status: function(code) { this.statusCode = code; return this; },
      json: function(data) { jsonResponse = data; return this; }
    };

    await authController.rejectStudent(req, res);
    assert.ok(jsonResponse);
    assert.equal(jsonResponse.success, true);

    const student = await Student.findById(studentId);
    assert.ok(student);
    assert.equal(student.isRejected, true);

    const record = await PhoneRecord.findOne({ phone: testPhone });
    assert.equal(record.attemptCount, 1);
    assert.equal(record.blacklisted, false);
  });

  await t.test('3. Registering again with rejected number deletes old record and increments count', async () => {
    // 2nd Attempt
    const student2 = await authService.register(dummyStudentData);
    assert.ok(student2._id);
    studentId = student2._id.toString(); // update studentId

    const record = await PhoneRecord.findOne({ phone: testPhone });
    assert.equal(record.attemptCount, 2);

    // Verify old rejected student is gone (since it registered again)
    const count = await Student.countDocuments({ studentPhone: testPhone });
    assert.equal(count, 1);
  });

  await t.test('4. Simulate attempts 3, 4, and 5', async () => {
    // Reject 2nd attempt
    await Student.findByIdAndUpdate(studentId, { verified: false, isRejected: true });

    // 3rd Attempt
    const student3 = await authService.register(dummyStudentData);
    assert.equal((await PhoneRecord.findOne({ phone: testPhone })).attemptCount, 3);
    await Student.findByIdAndUpdate(student3._id, { verified: false, isRejected: true });

    // 4th Attempt
    const student4 = await authService.register(dummyStudentData);
    assert.equal((await PhoneRecord.findOne({ phone: testPhone })).attemptCount, 4);
    await Student.findByIdAndUpdate(student4._id, { verified: false, isRejected: true });

    // 5th Attempt
    const student5 = await authService.register(dummyStudentData);
    studentId = student5._id.toString();
    const record = await PhoneRecord.findOne({ phone: testPhone });
    assert.equal(record.attemptCount, 5);
    assert.equal(record.blacklisted, false);
  });

  await t.test('5. Rejecting 5th attempt blacklists the phone number', async () => {
    const req = { body: { id: studentId } };
    let jsonResponse = null;
    const res = {
      status: function(code) { this.statusCode = code; return this; },
      json: function(data) { jsonResponse = data; return this; }
    };

    await authController.rejectStudent(req, res);
    assert.ok(jsonResponse);
    assert.equal(jsonResponse.success, true);

    const record = await PhoneRecord.findOne({ phone: testPhone });
    assert.equal(record.attemptCount, 5);
    assert.equal(record.blacklisted, true);
  });

  await t.test('6. Attempting a 6th registration throws blacklist error', async () => {
    await assert.rejects(
      async () => {
        await authService.register(dummyStudentData);
      },
      (err) => {
        assert.ok(err.message.includes('blacklisted') || err.message.includes('blocklisted'));
        return true;
      }
    );
  });

  await t.test('7. Calling getPhoneStatus returns status details', async () => {
    const req = { params: { phone: testPhone } };
    let jsonResponse = null;
    const res = {
      status: function(code) { this.statusCode = code; return this; },
      json: function(data) { jsonResponse = data; return this; }
    };

    await authController.getPhoneStatus(req, res);
    assert.ok(jsonResponse);
    assert.equal(jsonResponse.success, true);
    assert.equal(jsonResponse.data.blacklisted, true);
    assert.equal(jsonResponse.data.attemptCount, 5);
  });

  // Clean up test data
  await Student.deleteMany({ studentPhone: testPhone });
  await PhoneRecord.deleteMany({ phone: testPhone });

  // Close connection
  await mongoose.connection.close();
});
