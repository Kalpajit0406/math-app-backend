const http = require('http');
require('dotenv').config();

const BASE_URL = 'http://localhost:5000';
const STUDENT_PHONE = '6289855545';
const PASSWORD = process.env.TEACHER_BYPASS_PASSWORD || 'admin123';

const body = {
  studentPhone: STUDENT_PHONE,
  password: PASSWORD
};

const url = new URL(BASE_URL + '/api/v1/student/login');
const req = http.request({
  hostname: url.hostname,
  port: url.port,
  path: url.pathname,
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('RESPONSE:', data);
    process.exit(0);
  });
});

req.on('error', err => {
  console.error('ERROR:', err);
  process.exit(1);
});
req.write(JSON.stringify(body));
req.end();
