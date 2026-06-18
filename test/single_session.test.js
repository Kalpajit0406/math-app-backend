const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Student = require('../src/models/studentModel');
const AuthSession = require('../src/models/authSessionModel');
const bcrypt = require('bcrypt');

const BASE_URL = 'http://localhost:5000';
const STUDENT_PHONE = '9876543210';
const PASSWORD = 'studentpassword123';

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

test('Single Device Session Verification', async (t) => {
  if (mongoose.connection.readyState === 0) {
    await connectDB();
  }

  // Seed a normal student account to test concurrent session restrictions
  const existingStudents = await Student.find({ studentPhone: STUDENT_PHONE });
  const studentIds = existingStudents.map(s => s._id);
  await AuthSession.deleteMany({ userId: { $in: studentIds } });
  await Student.deleteMany({ studentPhone: STUDENT_PHONE });

  const Class = mongoose.model('Class');
  const classDoc = await Class.findOne({ classId: 10 });
  const classId = classDoc ? classDoc._id : new mongoose.Types.ObjectId();

  const hashedPassword = await bcrypt.hash(PASSWORD, 10);
  const student = new Student({
    firstName: 'Session',
    lastName: 'Test',
    classNo: 10,
    classId: classId,
    language: 'English',
    studentPhone: STUDENT_PHONE,
    guardianPhone: STUDENT_PHONE,
    password: hashedPassword,
    passwordHash: hashedPassword,
    accountType: 'NORMAL',
    accountStatus: 'APPROVED'
  });
  await student.save();

  let tokenA = '';
  let refreshTokenA = '';
  let tokenB = '';

  await t.test('1. First login (Device A) to get tokenA', async () => {
    const res = await request('POST', '/api/v1/student/login', {
      studentPhone: STUDENT_PHONE,
      password: PASSWORD,
      deviceBlueprint: {
        androidId: 'device_a_123',
        model: 'Pixel 6',
        manufacturer: 'Google',
        appInstallId: 'install_a_123'
      }
    });
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    assert.ok(body.data.accessToken);
    assert.ok(body.data.refreshToken);
    tokenA = body.data.accessToken;
    refreshTokenA = body.data.refreshToken;
  });

  await t.test('2. Verify tokenA is valid and can make requests', async () => {
    const res = await request('GET', '/api/v1/student/me', null, {
      Authorization: `Bearer ${tokenA}`,
    });
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    assert.equal(body.data.studentPhone, STUDENT_PHONE);
  });

  await t.test('3. Second login (Device B) should fail with concurrent login error', async () => {
    const res = await request('POST', '/api/v1/student/login', {
      studentPhone: STUDENT_PHONE,
      password: PASSWORD,
      deviceBlueprint: {
        androidId: 'device_b_456',
        model: 'Galaxy S22',
        manufacturer: 'Samsung',
        appInstallId: 'install_b_456'
      }
    });
    assert.equal(res.status, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
    assert.match(body.message, /already logged in on another device/);
  });

  await t.test('4. Logout Device A using its refreshToken', async () => {
    const res = await request('POST', '/api/v1/student/logout', {
      refreshToken: refreshTokenA
    });
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
  });

  await t.test('5. Second login (Device B) should now succeed after logout of Device A', async () => {
    const res = await request('POST', '/api/v1/student/login', {
      studentPhone: STUDENT_PHONE,
      password: PASSWORD,
      deviceBlueprint: {
        androidId: 'device_b_456',
        model: 'Galaxy S22',
        manufacturer: 'Samsung',
        appInstallId: 'install_b_456'
      }
    });
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    assert.ok(body.data.accessToken);
    tokenB = body.data.accessToken;
    assert.notEqual(tokenA, tokenB);
  });

  await t.test('6. Verify tokenB is valid and can make requests', async () => {
    const res = await request('GET', '/api/v1/student/me', null, {
      Authorization: `Bearer ${tokenB}`,
    });
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    assert.equal(body.data.studentPhone, STUDENT_PHONE);
  });

  await t.test('7. Verify tokenA (Device A) remains invalid', async () => {
    const res = await request('GET', '/api/v1/student/me', null, {
      Authorization: `Bearer ${tokenA}`,
    });
    assert.equal(res.status, 401);
  });

  // Cleanup seeded test student
  await Student.deleteMany({ studentPhone: STUDENT_PHONE });
  await AuthSession.deleteMany({ userId: student._id });
  await mongoose.connection.close(false);
});
