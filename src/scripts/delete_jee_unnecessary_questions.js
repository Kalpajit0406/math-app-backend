require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Question = require('../models/questionModel');

async function run() {
  await connectDB();
  
  const jeeClassId = '6a2304137e1083c179789f3e';
  const matricesChapterId = '6a3c77ada795931fa86af975';
  
  console.log('Identifying unnecessary questions to delete in Joint Entrance...');
  
  // We query with the raw collection to ensure we capture all questions (even soft-deleted ones)
  const result = await mongoose.connection.db.collection('questions').deleteMany({
    classId: new mongoose.Types.ObjectId(jeeClassId),
    chapterId: { $ne: new mongoose.Types.ObjectId(matricesChapterId) }
  });
  
  console.log(`Successfully deleted ${result.deletedCount} unnecessary questions from Joint Entrance class.`);
  
  await mongoose.disconnect();
}

run().catch(console.error);
