/**
 * Script to delete all unnecessary questions from the DB.
 * Deletes all questions from Class 9 and Class 10, plus all dummy/placeholder questions from all classes.
 */

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Question = require('../models/questionModel');

async function clean() {
  console.log('Connecting to database...');
  await connectDB();

  // Class 9 and Class 10 ObjectIds
  const class9Id = '6a2304137e1083c179789f3a';
  const class10Id = '6a2304137e1083c179789f3b';

  console.log('Identifying questions to delete...');

  // 1. Delete all questions in Class 9 and 10
  const class910Query = {
    classId: { $in: [new mongoose.Types.ObjectId(class9Id), new mongoose.Types.ObjectId(class10Id)] }
  };
  const countClass910 = await Question.countDocuments(class910Query);
  console.log(`Found ${countClass910} questions in Class 9 and Class 10.`);

  // 2. Delete all dummy/placeholder/test questions from other classes
  const dummyQuery = {
    $or: [
      { question: /^Question$/i },
      { question: /^Question \d+$/i },
      { question: /^What is 2\+2 in Joint Entrance/i },
      { question: /^DUMMY SECURE QUESTION/i },
      { question: /^Timer test/i },
      { question: /^Normalized language test/i },
      { question: /^What is 1 \+ 1/i },
      { question: /^What is 7 \+ 3/i }
    ],
    // Avoid deleting the Class 9 and 10 questions twice
    classId: { 
      $nin: [
        new mongoose.Types.ObjectId(class9Id), 
        new mongoose.Types.ObjectId(class10Id)
      ] 
    }
  };

  const countDummies = await Question.countDocuments(dummyQuery);
  console.log(`Found ${countDummies} additional dummy/placeholder questions in other classes.`);

  // List some examples before deleting
  if (countClass910 > 0) {
    const samples = await Question.find(class910Query).limit(5);
    console.log('Class 9/10 sample questions to delete:');
    samples.forEach(s => console.log(` - [${s.classNo}] ${s.question}`));
  }
  if (countDummies > 0) {
    const samples = await Question.find(dummyQuery).limit(5);
    console.log('Other dummy sample questions to delete:');
    samples.forEach(s => console.log(` - [${s.classNo}] ${s.question}`));
  }

  // Execute deletion
  console.log('Deleting Class 9 and Class 10 questions...');
  const del910Res = await Question.deleteMany(class910Query);
  console.log(`✓ Deleted ${del910Res.deletedCount} questions from Class 9 & 10.`);

  console.log('Deleting dummy/placeholder questions from other classes...');
  const delDummyRes = await Question.deleteMany(dummyQuery);
  console.log(`✓ Deleted ${delDummyRes.deletedCount} dummy questions.`);

  console.log('====================================================');
  console.log('CLEANUP COMPLETED SUMMARY:');
  console.log(`Total questions deleted: ${del910Res.deletedCount + delDummyRes.deletedCount}`);
  console.log('====================================================');

  await mongoose.disconnect();
  console.log('Disconnected from database.');
}

clean().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
