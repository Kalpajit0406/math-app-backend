require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Question = require('../models/questionModel');

async function run() {
  await connectDB();
  
  const jeeClassId = '6a2304137e1083c179789f3e';
  const matricesChapterId = '6a3c77ada795931fa86af975';
  
  console.log('Fetching questions in Joint Entrance that are NOT in the matrices/determinants chapter...');
  const questions = await Question.find({
    classId: new mongoose.Types.ObjectId(jeeClassId),
    chapterId: { $ne: new mongoose.Types.ObjectId(matricesChapterId) }
  });
  
  console.log(`Found ${questions.length} questions:`);
  questions.forEach(q => {
    console.log(`Question ID: ${q._id}`);
    console.log(`Chapter: ${q.chapterId ? (q.chapterId.chapterName || q.chapterId) : 'null'}`);
    console.log(`Text: ${q.question}`);
    console.log('--------------------------------------------------');
  });
  
  await mongoose.disconnect();
}

run().catch(console.error);
