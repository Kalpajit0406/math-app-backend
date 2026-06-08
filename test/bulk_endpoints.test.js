const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

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

test('Bulk Operations API Verification', async (t) => {
  let token = '';

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

  // 2. Test bulk deletion of announcements
  await t.test('Create and bulk delete announcements', async () => {
    // Create first announcement
    const res1 = await request(
      'POST',
      '/api/v1/announcements/admin',
      {
        title: 'Test Announcement 1',
        message: 'This is announcement 1',
        targetClass: 'all',
      },
      { 'Authorization': `Bearer ${token}` }
    );
    assert.equal(res1.status, 201);
    const ann1 = JSON.parse(res1.body).data;

    // Create second announcement
    const res2 = await request(
      'POST',
      '/api/v1/announcements/admin',
      {
        title: 'Test Announcement 2',
        message: 'This is announcement 2',
        targetClass: '10',
      },
      { 'Authorization': `Bearer ${token}` }
    );
    assert.equal(res2.status, 201);
    const ann2 = JSON.parse(res2.body).data;

    assert.ok(ann1._id);
    assert.ok(ann2._id);

    // Bulk delete both
    const delRes = await request(
      'POST',
      '/api/v1/announcements/bulk-delete',
      { ids: [ann1._id, ann2._id] },
      { 'Authorization': `Bearer ${token}` }
    );
    assert.equal(delRes.status, 200);
    const delBody = JSON.parse(delRes.body);
    assert.ok(delBody.success);
    assert.equal(delBody.deletedCount, 2);
  });
});
