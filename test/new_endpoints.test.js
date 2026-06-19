const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const sharp = require('sharp');

const BASE_URL = 'http://localhost:5000';
const STUDENT_PHONE = '6289855545'; // bypass teacher phone triggers student login details in bypass mode

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

test('Test Config and Test Response API Verification', async (t) => {
  let token = '';
  let testConfigId = '';

  // 1. Get auth token
  await t.test('Bypass Login to acquire auth token', async () => {
    const res = await request('POST', '/api/v1/student/login', {
      studentPhone: STUDENT_PHONE,
      password: process.env.TEACHER_BYPASS_PASSWORD || 'admin123',
    });
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    assert.ok(body.data.accessToken);
    token = body.data.accessToken;
  });

  // 2. Create TestConfig
  await t.test('Create TestConfig', async () => {
    const res = await request(
      'POST',
      '/api/v1/tests',
      {
        date: '2026-05-22',
        time: '10:00 AM',
        classNo: 10,
        language: 'English',
        totalMarks: 100,
        marksPQ: 4,
        timePQ: 60,
        negativeMarksPQ: 1,
        chapters: ['Algebra'],
      },
      {
        'Authorization': `Bearer ${token}`
      }
    );
    assert.equal(res.status, 201);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    assert.ok(body.test._id);
    testConfigId = body.test._id;
  });

  // 3. Get Tests (Web Client - no agent/auth headers)
  await t.test('GET /api/v1/tests (Web Client -> returns test configs)', async () => {
    const res = await request('GET', '/api/v1/tests');
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body));
    const found = body.some(t => (t.id || t._id) === testConfigId);
    assert.ok(found, 'Created test config should be in the tests list');
  });

  // 4. Get Tests (Flutter Client -> returns exams)
  await t.test('GET /api/v1/tests (Flutter Client -> returns exams)', async () => {
    const res = await request('GET', '/api/v1/tests', null, {
      'User-Agent': 'Dart/3.0 (dart:io)',
      'Authorization': `Bearer ${token}`
    });
    // The integration.test.js created an exam or we might get an array
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    // Flutter GET /api/v1/tests returns exam format: { success, data }
    assert.ok(body.hasOwnProperty('success'));
    assert.ok(Array.isArray(body.data));
  });

  // 5. Get Tests by Class and Language
  await t.test('GET /api/v1/tests/10/English', async () => {
    const res = await request('GET', '/api/v1/tests/10/English', null, {
      'Authorization': `Bearer ${token}`
    });
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body));
    assert.ok(body.some(t => (t.id || t._id) === testConfigId));
  });

  // 6. Save Test Response
  await t.test('POST /api/v1/testResponse (Save submission)', async () => {
    const res = await request(
      'POST',
      '/api/v1/testResponse',
      {
        date: '2026-05-22',
        time: '10:15 AM',
        studentMobile: STUDENT_PHONE,
        testId: testConfigId,
        responses: [
          {
            questionNumber: 1,
            questionId: 'q1_id',
            selectedOption: 'A',
          }
        ]
      },
      {
        'Authorization': `Bearer ${token}`
      }
    );
    assert.equal(res.status, 201);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    assert.equal(body.data.studentMobile, STUDENT_PHONE);
  });

  // 7. Check Test Response
  await t.test('GET /api/v1/testResponse/check/:studentMobile/:testId', async () => {
    const res = await request('GET', `/api/v1/testResponse/check/${STUDENT_PHONE}/${testConfigId}`, null, {
      'Authorization': `Bearer ${token}`
    });
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    assert.equal(body.data.found, true);
    assert.equal(body.data.hasTestResponse, true);
  });

  // 8. Get student test response
  await t.test('GET /api/v1/testResponse/:studentMobile', async () => {
    const res = await request('GET', `/api/v1/testResponse/${STUDENT_PHONE}`, null, {
      'Authorization': `Bearer ${token}`
    });
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    assert.equal(body.data.studentMobile, STUDENT_PHONE);
  });

  // 9. Clean up test response
  await t.test('DELETE /api/v1/testResponse/delete/:testId', async () => {
    const res = await request(
      'DELETE',
      `/api/v1/testResponse/delete/${testConfigId}`,
      null,
      { 'Authorization': `Bearer ${token}` }
    );
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
  });

  // 10. Clean up TestConfig
  await t.test('DELETE /api/v1/tests/delete/:id', async () => {
    const res = await request('DELETE', `/api/v1/tests/delete/${testConfigId}`, null, {
      'Authorization': `Bearer ${token}`
    });
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
  });

  // 11. Start OCR Session (valid image)
  let ocrSessionId = '';
  await t.test('POST /api/v1/admin/ocr/session/start (valid image)', async () => {
    const imageBuffer = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 }
      }
    }).png().toBuffer();

    const formData = new FormData();
    const fileBlob = new Blob([imageBuffer], { type: 'image/png' });
    formData.append('image', fileBlob, 'test_image.png');

    const res = await fetch(`${BASE_URL}/api/v1/admin/ocr/session/start`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    assert.ok(res.status === 201 || res.status === 202);
    const body = await res.json();
    assert.ok(body.success);
    assert.ok(body.data.sessionId);
    ocrSessionId = body.data.sessionId;
  });

  // 12. Start OCR Session (empty image)
  await t.test('POST /api/v1/admin/ocr/session/start (empty image)', async () => {
    const formData = new FormData();
    const emptyBlob = new Blob([], { type: 'image/png' });
    formData.append('image', emptyBlob, 'empty_image.png');

    const res = await fetch(`${BASE_URL}/api/v1/admin/ocr/session/start`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.message.toLowerCase().includes('empty'));
  });
});
