const mongoose = require('mongoose');
const connectDB = require('./src/config/db');
const Chapter = require('./src/models/chapterModel');
const { getClassNoFromId } = require('./src/utils/classCache');

async function test() {
  await connectDB();
  const ch = await Chapter.findOne({ classId: { $type: 'objectId' } });
  console.log('Chapter doc:', ch);
  console.log('ch.classId:', ch.classId);
  console.log('getClassNoFromId(ch.classId):', getClassNoFromId(ch.classId));
  console.log('ch.toJSON():', ch.toJSON());
  await mongoose.disconnect();
}

test().catch(console.error);
