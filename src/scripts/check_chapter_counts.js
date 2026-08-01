require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Chapter = require('../models/chapterModel');
const Question = require('../models/questionModel');

const run = async () => {
  try {
    await connectDB();
    const chapters = await Chapter.find({ isDeleted: { $ne: true } });
    console.log(`Found ${chapters.length} active chapters.`);

    const chapterIds = chapters.map(c => c._id);
    const counts = await Question.aggregate([
      { $match: { chapterId: { $in: chapterIds } } },
      { $group: { _id: '$chapterId', count: { $sum: 1 } } }
    ]);
    
    console.log('--- Aggregated Counts ---');
    console.log(counts);

    const countMap = {};
    counts.forEach(c => {
      countMap[c._id.toString()] = c.count;
    });

    chapters.forEach(ch => {
      console.log(`Chapter: "${ch.chapterName}" (Class: ${ch.classId}) -> questionCount: ${countMap[ch._id.toString()] || 0}`);
    });
    
    await mongoose.connection.close();
  } catch (err) {
    console.error(err);
  }
};
run();
