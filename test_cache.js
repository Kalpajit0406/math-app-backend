const mongoose = require('mongoose');
const connectDB = require('./src/config/db');
const Chapter = require('./src/models/chapterModel');
const { getClassNoFromId } = require('./src/utils/classCache');

async function test() {
  await connectDB();
  const ch = await Chapter.findOne({ normalizedChapterName: 'quadratic equation in one variable' });
  console.log('Original chapter doc classId:', ch.classId);
  console.log('getClassNoFromId(ch.classId) output:', getClassNoFromId(ch.classId));
  console.log('ch.toJSON() output:', ch.toJSON());
  console.log('JSON.stringify(ch) output:', JSON.stringify(ch));
  await mongoose.disconnect();
}

test().catch(console.error);
