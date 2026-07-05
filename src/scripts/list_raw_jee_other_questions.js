require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

async function run() {
  await connectDB();
  
  const jeeClassId = '6a2304137e1083c179789f3e';
  const matricesChapterId = '6a3c77ada795931fa86af975';
  
  console.log('Fetching raw questions in Joint Entrance that are NOT in matrices/determinants chapter...');
  const questions = await mongoose.connection.db.collection('questions')
    .find({
      classId: new mongoose.Types.ObjectId(jeeClassId),
      chapterId: { $ne: new mongoose.Types.ObjectId(matricesChapterId) }
    }).toArray();
    
  console.log(`Found ${questions.length} raw questions:`);
  questions.forEach(q => {
    console.log(JSON.stringify(q, null, 2));
    console.log('--------------------------------------------------');
  });
  
  await mongoose.disconnect();
}

run().catch(console.error);
