require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

async function run() {
  await connectDB();
  
  const targetChapterId = '6a3c77ada795931fa86af975';
  console.log(`Checking chapter with ID: ${targetChapterId}...`);
  const rawChapter = await mongoose.connection.db.collection('chapters')
    .findOne({ _id: new mongoose.Types.ObjectId(targetChapterId) });
  console.log('Raw chapter:', rawChapter);

  console.log('\nChecking active questions count for this chapter ID:');
  const countQuestions = await mongoose.connection.db.collection('questions')
    .countDocuments({ chapterId: new mongoose.Types.ObjectId(targetChapterId) });
  console.log(`Count of questions: ${countQuestions}`);

  console.log('\nChecking active questions count with null/missing chapterId for class JEE:');
  const jeeClassId = '6a2304137e1083c179789f3e';
  const countJeeNull = await mongoose.connection.db.collection('questions')
    .countDocuments({ 
      classId: new mongoose.Types.ObjectId(jeeClassId),
      $or: [
        { chapterId: null },
        { chapterId: { $exists: false } }
      ]
    });
  console.log(`Count of JEE questions with null/missing chapterId: ${countJeeNull}`);

  await mongoose.disconnect();
}

run().catch(console.error);
