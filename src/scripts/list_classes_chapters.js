require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Class = require('../models/classModel');
const Chapter = require('../models/chapterModel');

const run = async () => {
  try {
    await connectDB();
    const classes = await Class.find({});
    console.log('--- Classes in DB ---');
    classes.forEach(c => {
      console.log(`className: "${c.className}", classId (Number): ${c.classId}, _id: ${c._id}`);
    });

    const chapters = await Chapter.find({});
    console.log('--- Chapters in DB ---');
    chapters.forEach(ch => {
      console.log(`chapterName: "${ch.chapterName}", classId: ${ch.classId}, _id: ${ch._id}`);
    });
    
    await mongoose.connection.close();
  } catch (err) {
    console.error(err);
  }
};
run();
