const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/userModel');
const Student = require('../models/studentModel');
const connectDB = require('../config/db');

dotenv.config();

async function seedTeacher() {
  const email = process.env.SEED_TEACHER_EMAIL;
  const phone = process.env.SEED_TEACHER_PHONE;
  const password = process.env.SEED_TEACHER_PASSWORD;
  const role = 'teacher';

  if (!phone || !password) {
    throw new Error('SEED_TEACHER_PHONE and SEED_TEACHER_PASSWORD are required');
  }

  try {
    await connectDB();
    console.log('Connected to MongoDB for seeding...');

    const hashedPassword = await bcrypt.hash(password, 10);

    await Student.findOneAndUpdate(
      { studentPhone: phone },
      {
        $set: {
          firstName: process.env.SEED_TEACHER_FIRST_NAME || 'Teacher',
          lastName: process.env.SEED_TEACHER_LAST_NAME || 'Account',
          classNo: Number.parseInt(process.env.SEED_TEACHER_CLASS_NO || '9', 10),
          language: process.env.SEED_TEACHER_LANGUAGE || 'English',
          guardianPhone: process.env.SEED_TEACHER_GUARDIAN_PHONE || phone,
          password: hashedPassword,
          role,
          verified: true,
          isRejected: false,
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
    console.log('Teacher student profile upserted successfully.');

    if (email) {
      await User.findOneAndUpdate(
        { email },
        {
          $set: {
            password: hashedPassword,
            role,
          },
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      );
      console.log('Teacher user profile upserted successfully.');
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error seeding teacher:', error);
    process.exit(1);
  }
}

seedTeacher();
