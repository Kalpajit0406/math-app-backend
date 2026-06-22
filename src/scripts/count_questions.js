require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Question = require('../models/questionModel');
const Class = require('../models/classModel');
const Chapter = require('../models/chapterModel');

const run = async () => {
  try {
    await connectDB();
    console.log('Connected to Database. Generating report...\n');

    // Load all classes and chapters for lookup
    const classes = await Class.find({});
    const chapters = await Chapter.find({});

    const classMap = {};
    classes.forEach(c => {
      classMap[c._id.toString()] = c.className || `Class ${c.classId}`;
    });

    const chapterMap = {};
    chapters.forEach(ch => {
      chapterMap[ch._id.toString()] = ch.chapterName;
    });

    // Run aggregation
    const results = await Question.aggregate([
      {
        $match: { isDeleted: { $ne: true } }
      },
      {
        $group: {
          _id: {
            classId: '$classId',
            chapterId: '$chapterId'
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: {
          '_id.classId': 1,
          'count': -1
        }
      }
    ]);

    // Print report
    console.log('--------------------------------------------------');
    console.log('  QUESTION COUNT REPORT BY CLASS AND CHAPTER');
    console.log('--------------------------------------------------');
    
    let totalAll = 0;
    const classGroups = {};

    results.forEach(row => {
      const classIdStr = row._id.classId ? row._id.classId.toString() : 'Unknown Class';
      const chapterIdStr = row._id.chapterId ? row._id.chapterId.toString() : 'Unknown Chapter';
      
      const className = classMap[classIdStr] || 'Unknown Class';
      const chapterName = chapterMap[chapterIdStr] || 'Unknown Chapter';
      const count = row.count;

      if (!classGroups[className]) {
        classGroups[className] = [];
      }
      classGroups[className].push({ chapterName, count });
      totalAll += count;
    });

    for (const className in classGroups) {
      console.log(`\n🔹 ${className}`);
      let classTotal = 0;
      classGroups[className].forEach(ch => {
        console.log(`  - ${ch.chapterName}: ${ch.count} questions`);
        classTotal += ch.count;
      });
      console.log(`  Total for ${className}: ${classTotal} questions`);
    }

    console.log('\n==================================================');
    console.log(`TOTAL ACTIVE QUESTIONS IN DB: ${totalAll}`);
    console.log('==================================================\n');

    await mongoose.connection.close();
  } catch (err) {
    console.error('Error running report:', err);
    process.exit(1);
  }
};

run();
