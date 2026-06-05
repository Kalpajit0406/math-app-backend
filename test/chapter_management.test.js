const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const BASE_URL = 'http://127.0.0.1:5000';
const TEACHER_PHONE = '6289855545'; // Admin/Teacher bypass phone

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

test('Chapter Management & Centralized Schema Synchronization', async (t) => {
  let token = '';
  let chapterId = '';
  let questionId = '';
  let initialVersion = 0;

  // 1. Authenticate as Teacher
  await t.test('Authenticate as Teacher/Admin', async () => {
    const res = await request('POST', '/api/v1/student/login', {
      studentPhone: TEACHER_PHONE,
      password: process.env.TEACHER_BYPASS_PASSWORD || 'admin123'
    });
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    assert.ok(body.data.accessToken);
    token = body.data.accessToken;
  });

  const headers = () => ({ 'Authorization': `Bearer ${token}` });

  // 2. Get initial sync version
  await t.test('Retrieve initial synchronization version', async () => {
    const res = await request('GET', '/api/v1/chapters/version', null, headers());
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    assert.ok(typeof body.version === 'number');
    initialVersion = body.version;
  });

  // 3. Get Chapters
  await t.test('Fetch seeded chapters list', async () => {
    const res = await request('GET', '/api/v1/chapters?classId=10', null, headers());
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length > 0);
    // All should be class 10
    body.data.forEach(ch => assert.equal(ch.classId, 10));
  });

  // 4. Add Chapter
  await t.test('Add new custom chapter', async () => {
    const res = await request('POST', '/api/v1/chapters/add', {
      classId: 10,
      chapterName: 'Test Integration Chapter'
    }, headers());
    assert.equal(res.status, 201);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    assert.equal(body.data.chapterName, 'Test Integration Chapter');
    assert.ok(body.data._id);
    chapterId = body.data._id;
  });

  // 5. Verify version incremented
  await t.test('Verify version increments on chapter add', async () => {
    const res = await request('GET', '/api/v1/chapters/version', null, headers());
    const body = JSON.parse(res.body);
    assert.ok(body.version > initialVersion);
  });

  // 6. Prevent duplicates
  await t.test('Prevent duplicate chapters in the same class', async () => {
    const res = await request('POST', '/api/v1/chapters/add', {
      classId: 10,
      chapterName: '  TEST integration chapter  ' // leading/trailing spaces & case variation
    }, headers());
    assert.equal(res.status, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
  });

  // 7. Get Chapter Usage (should be 0)
  await t.test('Verify chapter has 0 questions initially', async () => {
    const res = await request('GET', `/api/v1/chapters/${chapterId}/usage`, null, headers());
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.count, 0);
  });

  // 8. Add Question linked to this Chapter
  await t.test('Add a question linking to the new chapter', async () => {
    const res = await request('POST', '/api/v1/question/addQuestion', {
      classNo: 10,
      chapter: 'Test Integration Chapter', // Will auto-resolve chapterId via pre-validate hook
      question: 'What is 2 + 2?',
      options: ['3', '4', '5', '6'],
      correctAnswer: '4',
      language: 'English'
    }, headers());
    assert.equal(res.status, 201);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    assert.equal(body.data.chapterId, chapterId);
    questionId = body.data.id || body.data._id;
  });

  // 9. Get Chapter Usage (should now be 1)
  await t.test('Verify chapter usage increments to 1', async () => {
    const res = await request('GET', `/api/v1/chapters/${chapterId}/usage`, null, headers());
    const body = JSON.parse(res.body);
    assert.equal(body.count, 1);
  });

  // 10. Edit Chapter (Rename)
  await t.test('Rename chapter and propagate changes to questions', async () => {
    const res = await request('PUT', `/api/v1/chapters/edit/${chapterId}`, {
      chapterName: 'Renamed Integration Chapter',
      action: 'rename'
    }, headers());
    assert.equal(res.status, 200);
    
    // Check if question snapshot updated
    const qRes = await request('GET', `/api/v1/question/questions?classNo=10&chapter=Renamed%20Integration%20Chapter`, null, headers());
    assert.equal(qRes.status, 200);
    const qBody = JSON.parse(qRes.body);
    assert.ok(qBody.data.length > 0);
    assert.equal(qBody.data[0].chapter, 'Renamed Integration Chapter');
  });

  // 11. Edit Chapter (Delete all questions)
  await t.test('Delete all questions in chapter & remove chapter', async () => {
    const res = await request('PUT', `/api/v1/chapters/edit/${chapterId}`, {
      action: 'delete_questions'
    }, headers());
    assert.equal(res.status, 200);

    // Verify question is deleted
    const qRes = await request('GET', `/api/v1/question/questions?classNo=10&chapter=Renamed%20Integration%20Chapter`, null, headers());
    const qBody = JSON.parse(qRes.body);
    assert.equal(qBody.data.length, 0);

    // Verify chapter is deleted
    const cRes = await request('GET', `/api/v1/chapters?classId=10`, null, headers());
    const cBody = JSON.parse(cRes.body);
    const exists = cBody.data.some(c => c._id === chapterId);
    assert.equal(exists, false);
  });
});
