const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const BASE_URL = 'http://localhost:5000';
const STUDENT_PHONE = '6289855545'; // bypass teacher phone triggers student login details in bypass mode
const PASSWORD = process.env.TEACHER_BYPASS_PASSWORD || 'admin123';

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
  let tokenA = '';
  let tokenB = '';

  await t.test('1. First login (Device A) to get tokenA', async () => {
    const res = await request('POST', '/api/v1/student/login', {
      studentPhone: STUDENT_PHONE,
      password: PASSWORD,
    });
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    assert.ok(body.data.accessToken);
    tokenA = body.data.accessToken;
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

  await t.test('3. Second login (Device B) to get tokenB', async () => {
    const res = await request('POST', '/api/v1/student/login', {
      studentPhone: STUDENT_PHONE,
      password: PASSWORD,
    });
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    assert.ok(body.data.accessToken);
    tokenB = body.data.accessToken;
    assert.notEqual(tokenA, tokenB); // should be different tokens (having different jwtVersion)
  });

  await t.test('4. Verify tokenB is valid and can make requests', async () => {
    const res = await request('GET', '/api/v1/student/me', null, {
      Authorization: `Bearer ${tokenB}`,
    });
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    assert.equal(body.data.studentPhone, STUDENT_PHONE);
  });

  await t.test('5. Verify tokenA (Device A) is now blocked/invalidated', async () => {
    const res = await request('GET', '/api/v1/student/me', null, {
      Authorization: `Bearer ${tokenA}`,
    });
    // Should return 401 Unauthorized
    assert.equal(res.status, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
    assert.equal(body.code, 'session_invalidated');
    assert.match(body.message, /Logged in from another device/);
  });
});
