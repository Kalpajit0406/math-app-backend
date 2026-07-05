require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

async function run() {
  await connectDB();
  
  const jeeClassId = '6a2304137e1083c179789f3e';
  const questions = await mongoose.connection.db.collection('questions')
    .find({ classId: new mongoose.Types.ObjectId(jeeClassId) }).toArray();
    
  console.log(`Total questions under JEE in DB: ${questions.length}`);
  
  const chapters = await mongoose.connection.db.collection('chapters').find({}).toArray();
  const chapterMap = {};
  chapters.forEach(ch => {
    chapterMap[ch._id.toString()] = ch.chapterName;
  });

  questions.forEach(q => {
    const chName = chapterMap[q.chapterId ? q.chapterId.toString() : ''] || 'null';
    console.log(`ID: ${q._id}, Chapter: "${chName}" (${q.chapterId}), Text: "${q.question.substring(0, 50)}...", isDeleted: ${q.isDeleted}`);
  });
  
  await mongoose.disconnect();
}

run().catch(console.error);
