const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();
const mongoose = require('mongoose');

// Import models
const Student = require('../src/models/studentModel');
const Chapter = require('../src/models/chapterModel');
const Question = require('../src/models/questionModel');
const Exam = require('../src/models/examModel');
const attemptService = require('../src/services/attemptService');
const examService = require('../src/services/examService');
const { resolveChapterIds } = require('../src/utils/chapterNormalization');

test('Joint Entrance Parent/Subchapter Naming & Expansion Verification', async (t) => {
  // Connect directly without running indexing or seeding scripts
  if (mongoose.connection.readyState === 0) {
    const uri = process.env.MONGODB_URI_DIRECT || process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not configured');
    await mongoose.connect(uri, {
      dbName: process.env.MONGODB_DB_NAME || 'MathswithSD_DB'
    });
  }

  // Pre-clean Class 13 chapters and questions created during this test
  await Chapter.deleteMany({ classId: 13, chapterName: { $regex: /^(11|12|JEE):/ } });

  // Ensure default parent chapters exist
  const parent11 = await Chapter.findOneAndUpdate(
    { classId: 13, normalizedChapterName: '11' },
    { classId: 13, chapterName: '11' },
    { upsert: true, returnDocument: 'after' }
  );
  const parentJEE = await Chapter.findOneAndUpdate(
    { classId: 13, normalizedChapterName: 'jee' },
    { classId: 13, chapterName: 'JEE' },
    { upsert: true, returnDocument: 'after' }
  );

  let subId1 = null;
  let subId2 = null;

  await t.test('1. Verify resolveChapterIds with exact parent selection', async () => {
    // Set up subchapters manually
    const sub1 = await Chapter.create({
      classId: 13,
      chapterName: '11: Probability'
    });
    subId1 = sub1._id;

    const sub2 = await Chapter.create({
      classId: 13,
      chapterName: '11: Permutations'
    });
    subId2 = sub2._id;

    const sub3 = await Chapter.create({
      classId: 13,
      chapterName: 'JEE: Calculus'
    });

    // Resolve '11' -> should return parent '11' ID and subchapters starting with '11: '
    const resolved11 = await resolveChapterIds(13, ['11']);
    assert.ok(resolved11.length >= 3); // parent '11' + '11: Probability' + '11: Permutations'
    const resolvedIdsStr = resolved11.map(id => id.toString());
    assert.ok(resolvedIdsStr.includes(parent11._id.toString()));
    assert.ok(resolvedIdsStr.includes(sub1._id.toString()));
    assert.ok(resolvedIdsStr.includes(sub2._id.toString()));

    // Resolve 'JEE' -> should return parent 'JEE' and sub3
    const resolvedJEE = await resolveChapterIds(13, ['JEE']);
    assert.ok(resolvedJEE.length >= 2);
    const resolvedJeeStr = resolvedJEE.map(id => id.toString());
    assert.ok(resolvedJeeStr.includes(parentJEE._id.toString()));
    assert.ok(resolvedJeeStr.includes(sub3._id.toString()));
  });

  await t.test('2. Verify resolveChapterIds with specific subchapter selection', async () => {
    // Resolve '11: Probability' -> should only return that specific subchapter
    const resolvedSpecific = await resolveChapterIds(13, ['11: Probability']);
    assert.equal(resolvedSpecific.length, 1);
    assert.equal(resolvedSpecific[0].toString(), subId1.toString());
  });

  // Clean up
  await Chapter.deleteMany({ classId: 13, chapterName: { $regex: /^(11|12|JEE):/ } });
  await mongoose.connection.close();
});
