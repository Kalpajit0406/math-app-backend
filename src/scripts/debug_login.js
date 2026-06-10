const http = require('http');

const BASE_URL = 'http://localhost:5000';
const STUDENT_PHONE = '6289855545';

async function testLogin() {
  const url = new URL(BASE_URL + '/api/v1/student/login');
  const body = {
    studentPhone: STUDENT_PHONE,
    password: process.env.TEACHER_BYPASS_PASSWORD || 'admin123',
  };

  const options = {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  };

  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log('STATUS:', res.statusCode);
        console.log('RESPONSE:', data);
        resolve();
      });
    });

    req.on('error', (err) => {
      console.error('ERROR:', err.message);
      resolve();
    });

    req.write(JSON.stringify(body));
    req.end();
  });
}

testLogin();
