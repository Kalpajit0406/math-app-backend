require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Chapter = require('../models/chapterModel');

async function run() {
  await connectDB();
  
  const targetChapterId = '6a3c77ada795931fa86af975';
  const jeeClassId = '6a2304137e1083c179789f3e';
  
  console.log(`Checking if chapter ${targetChapterId} exists...`);
  const existing = await Chapter.findById(targetChapterId);
  if (existing) {
    console.log('Chapter already exists:', existing);
  } else {
    console.log('Creating chapter...');
    const newChapter = new Chapter({
      _id: new mongoose.Types.ObjectId(targetChapterId),
      classId: new mongoose.Types.ObjectId(jeeClassId),
      chapterName: '11: Matrices and determinants',
      isActive: true,
      isDeleted: false
    });
    await newChapter.save();
    console.log('Successfully re-created the chapter in the database:', newChapter);
  }
  
  await mongoose.disconnect();
}

run().catch(console.error);
