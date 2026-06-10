const mongoose = require('mongoose');
require('dotenv').config();
const connectDB = require('../config/db');
const Student = require('../models/studentModel');

async function check() {
  await connectDB();
  const student = await Student.findOne({ studentPhone: '6289855545' }).select('+passwordHash');
  console.log('STUDENT IN DB:', JSON.stringify(student, null, 2));
  process.exit(0);
}

check();
