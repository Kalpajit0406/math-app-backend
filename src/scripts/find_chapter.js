require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Chapter = require('../models/chapterModel');
const Class = require('../models/classModel');

async function run() {
  await connectDB();
  console.log('Searching for matrices/determinants chapters...');
  
  const allChapters = await Chapter.find({});
  const classes = await Class.find({});
  const classMap = {};
  classes.forEach(c => {
    classMap[c._id.toString()] = c;
  });

  allChapters.forEach(ch => {
    const name = ch.chapterName.toLowerCase();
    if (name.includes('matr') || name.includes('det') || name.includes('11') || name.includes('12')) {
      const cls = classMap[ch.classId ? ch.classId.toString() : ''] || { className: 'Unknown' };
      console.log(`- Chapter ID: ${ch._id}, Name: "${ch.chapterName}", Class: "${cls.className}" (classId: ${cls.classId}), Normalized: "${ch.normalizedChapterName}"`);
    }
  });

  await mongoose.disconnect();
}

run().catch(console.error);
