require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

async function run() {
  await connectDB();
  const jeeClassId = '6a2304137e1083c179789f3e';
  console.log(`Querying all chapters for JEE classId: ${jeeClassId}...`);
  
  const chapters = await mongoose.connection.db.collection('chapters')
    .find({ classId: new mongoose.Types.ObjectId(jeeClassId) })
    .toArray();
    
  console.log(`Found ${chapters.length} chapters:`);
  chapters.forEach(ch => {
    console.log(JSON.stringify(ch, null, 2));
  });

  await mongoose.disconnect();
}

run().catch(console.error);
