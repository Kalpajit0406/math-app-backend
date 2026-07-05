require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Class = require('../models/classModel');
const Chapter = require('../models/chapterModel');
const Question = require('../models/questionModel');

async function debug() {
  await connectDB();
  console.log('--- CLASSES ---');
  const classes = await Class.find({});
  classes.forEach(c => {
    console.log(`Class ID: ${c.classId}, Name: ${c.className || c.name}, MongoID: ${c._id}`);
  });

  console.log('\n--- CHAPTERS ---');
  const chapters = await Chapter.find({});
  chapters.forEach(ch => {
    console.log(`Chapter: "${ch.chapterName}", Class ID Ref: ${ch.classId}, MongoID: ${ch._id}, Normalized: "${ch.normalizedChapterName}"`);
  });

  console.log('\n--- QUESTIONS SAMPLE (First 5 JEE) ---');
  const jeeClass = classes.find(c => c.classId === 13 || (c.className && c.className.includes('JEE')));
  if (jeeClass) {
    const questions = await Question.find({ classId: jeeClass._id }).limit(5);
    questions.forEach(q => {
      console.log(`Question ID: ${q._id}, ChapterId Ref: ${q.chapterId ? (q.chapterId._id || q.chapterId) : 'NULL'}, Question Text: ${q.question.substring(0, 60)}...`);
    });
  } else {
    console.log('No JEE class found.');
  }

  await mongoose.disconnect();
}

debug().catch(err => {
  console.error(err);
  process.exit(1);
});
