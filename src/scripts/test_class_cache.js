require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Chapter = require('../models/chapterModel');

const run = async () => {
  try {
    await connectDB();
    const chapters = await Chapter.find({}).lean();
    const types = {};
    chapters.forEach(c => {
      const type = c.classId ? c.classId.constructor.name : 'null';
      types[type] = (types[type] || 0) + 1;
    });
    console.log('Chapter classId types in DB:', types);
    await mongoose.connection.close();
  } catch (err) {
    console.error(err);
  }
};
run();
