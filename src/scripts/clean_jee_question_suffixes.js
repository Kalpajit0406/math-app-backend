require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Question = require('../models/questionModel');

async function run() {
  await connectDB();
  
  const jeeClassId = '6a2304137e1083c179789f3e';
  
  console.log('Fetching active questions for class JEE...');
  const questions = await Question.find({ classId: new mongoose.Types.ObjectId(jeeClassId) });
  console.log(`Found ${questions.length} questions to process.`);

  let updatedCount = 0;
  
  for (const q of questions) {
    const oldText = q.question;
    // Regex to match trailing [JEE Practice ...] or [JEE Main PYQ Variant ...]
    const cleanText = oldText.replace(/\s*\[JEE\s+(?:Practice|Main\s+PYQ\s+Variant)\s+\d+\]\.?/gi, '.').replace(/\.+$/, '.');
    
    if (oldText !== cleanText) {
      console.log(`Original: "${oldText}"`);
      console.log(`Cleaned:  "${cleanText}"`);
      console.log('--------------------------------------------------');
      
      q.question = cleanText;
      await q.save();
      updatedCount++;
    }
  }

  console.log(`Successfully updated ${updatedCount} questions in the database.`);
  
  await mongoose.disconnect();
}

run().catch(console.error);
