/**
 * Backend Integration Tests
 * Tests critical endpoints: login, questions, announcements, attempts
 */

const http = require('http');

const BASE_URL = 'http://localhost:5000';
const TEACHER_PHONE = '6289855545';
const TEACHER_PASS = 'x';

let testsPassed = 0;
let testsFailed = 0;
const results = [];

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

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    testsPassed++;
    results.push({ name, status: 'PASS' });
  } catch (e) {
    console.error(`❌ ${name}: ${e.message}`);
    testsFailed++;
    results.push({ name, status: 'FAIL', error: e.message });
  }
}

async function runTests() {
  let token = null;

  // Test 1: Login and get token
  await test('Teacher Login (bypass)', async () => {
    const res = await request('POST', '/api/v1/student/login', {
      studentPhone: TEACHER_PHONE,
      password: TEACHER_PASS,
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!body.data || !body.data.accessToken) {
      throw new Error('No token in response');
    }
    token = body.data.accessToken;
    console.log(`   Token: ${token.slice(0, 20)}...`);
  });

  // Test 2: Create announcement
  let announcementId = null;
  await test('Create Announcement', async () => {
    const res = await request(
      'POST',
      '/api/v1/announcements/admin',
      {
        title: 'Integration Test Notice',
        message: 'This is a test announcement',
        targetClass: 'all',
        priority: 'low',
      },
      { Authorization: `Bearer ${token}` }
    );
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!body.data || !body.data._id) throw new Error('No announcement ID');
    announcementId = body.data._id;
  });

  // Test 3: Fetch announcements (verify creation)
  await test('Fetch Announcements', async () => {
    const res = await request('GET', '/api/v1/announcements');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!Array.isArray(body.data)) throw new Error('Data is not an array');
    if (body.data.length === 0) throw new Error('No announcements found');
    const found = body.data.some((a) => a._id === announcementId);
    if (!found) throw new Error('Created announcement not found in list');
  });

  // Test 4: Create question
  let questionId = null;
  await test('Create Question', async () => {
    const res = await request(
      'POST',
      '/api/v1/question/addQuestion',
      {
        question: 'What is 7 + 3?',
        options: ['9', '10', '11', '12'],
        correctAnswer: '10',
        language: 'English',
        classNo: 10,
        chapter: 'Arithmetic',
      },
      { Authorization: `Bearer ${token}` }
    );
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!body.data || !body.data._id) throw new Error('No question ID');
    questionId = body.data._id;
  });

  // Test 5: Fetch questions with case-insensitive language
  await test('Fetch Questions (lowercase language)', async () => {
    const res = await request('GET', '/api/v1/question/questions?classNo=10&language=english');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!body.data) throw new Error('No data in response');
    if (body.data.length === 0) throw new Error('No questions found');
    const found = body.data.some((q) => q._id === questionId);
    if (!found) throw new Error('Created question not found');
  });

  // Test 6: Health check
  await test('Health Endpoint', async () => {
    const res = await request('GET', '/health');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (!body.success) throw new Error('Health check failed');
  });

  // Test 7: Protected endpoint without token (should fail)
  await test('Protected Endpoint Rejects Unauthenticated', async () => {
    const res = await request('POST', '/api/v1/question/addQuestion', {
      question: 'test',
      options: ['a', 'b', 'c', 'd'],
      correctAnswer: 'a',
      language: 'English',
      classNo: 10,
      chapter: 'test',
    });
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  // Test 8: Validation - missing required fields
  await test('Question Validation - Missing Fields', async () => {
    const res = await request(
      'POST',
      '/api/v1/question/addQuestion',
      { question: 'incomplete' },
      { Authorization: `Bearer ${token}` }
    );
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  // Test 9: Case-insensitive language normalization
  await test('Question Language Normalization', async () => {
    const res = await request(
      'POST',
      '/api/v1/question/addQuestion',
      {
        question: 'Normalized language test',
        options: ['a', 'b', 'c', 'd'],
        correctAnswer: 'a',
        language: 'english',
        classNo: 10,
        chapter: 'test',
      },
      { Authorization: `Bearer ${token}` }
    );
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const body = JSON.parse(res.body);
    if (body.data.language !== 'English') {
      throw new Error(`Language not normalized, got: ${body.data.language}`);
    }
  });

  // Test 10: Announcement validation - targetClass='all' accepted
  await test('Announcement Validation - targetClass=all', async () => {
    const res = await request(
      'POST',
      '/api/v1/announcements/admin',
      {
        title: 'All Classes Notice',
        message: 'Announcement for all classes',
        targetClass: 'all',
      },
      { Authorization: `Bearer ${token}` }
    );
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
  });

  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${testsFailed}`);
  console.log(`Total:  ${testsPassed + testsFailed}`);
  console.log('');

  if (testsFailed > 0) {
    console.log('Failed tests:');
    results
      .filter((r) => r.status === 'FAIL')
      .forEach((r) => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
  }

  process.exit(testsFailed > 0 ? 1 : 0);
}

// Run tests
console.log(`Starting integration tests against ${BASE_URL}\n`);
runTests().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
