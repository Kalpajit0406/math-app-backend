require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Student = require('../models/studentModel');

const cleanDB = async () => {
  try {
    await connectDB();
    console.log('Connected to DB');

    // Delete all students from both collections to be safe
    const studentRes = await Student.deleteMany({});
    console.log(`Deleted ${studentRes.deletedCount} from Student collection`);

    console.log('DB Cleaned successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error cleaning DB:', error);
    process.exit(1);
  }
};

cleanDB();
