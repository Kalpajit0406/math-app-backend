require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Chapter = require('../models/chapterModel');
const Class = require('../models/classModel');

async function run() {
  await connectDB();
  console.log('Searching raw collection for ALL chapters (including deleted)...');
  
  const rawChapters = await mongoose.connection.db.collection('chapters').find({}).toArray();
  const classes = await Class.find({});
  const classMap = {};
  classes.forEach(c => {
    classMap[c._id.toString()] = c;
  });

  rawChapters.forEach(ch => {
    const cls = classMap[ch.classId ? ch.classId.toString() : ''] || { className: 'Unknown' };
    console.log(`- Chapter ID: ${ch._id}, Name: "${ch.chapterName}", Class: "${cls.className}" (classId: ${cls.classId}), Normalized: "${ch.normalizedChapterName}", isDeleted: ${ch.isDeleted}, deletedAt: ${ch.deletedAt}`);
  });

  await mongoose.disconnect();
}

run().catch(console.error);
