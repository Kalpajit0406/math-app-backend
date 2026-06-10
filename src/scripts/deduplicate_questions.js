const mongoose = require('mongoose');
require('dotenv').config();
const connectDB = require('../config/db');
const Question = require('../models/questionModel');

async function deduplicate() {
  await connectDB();
  console.log('Connected to database.');

  try {
    const duplicates = await Question.aggregate([
      {
        $match: {
          questionHash: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$questionHash',
          count: { $sum: 1 },
          docs: { $push: '$_id' }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]);

    console.log(`Found ${duplicates.length} duplicate questionHash groups.`);

    let totalDeleted = 0;
    for (const group of duplicates) {
      // Keep the first document, delete the rest
      const [keepId, ...deleteIds] = group.docs;
      const res = await Question.deleteMany({ _id: { $in: deleteIds } });
      totalDeleted += res.deletedCount;
      console.log(`For hash ${group._id}, kept ${keepId}, deleted ${res.deletedCount} duplicates.`);
    }

    console.log(`Deduplication complete. Total deleted: ${totalDeleted}`);
    process.exit(0);
  } catch (error) {
    console.error('Error during deduplication:', error);
    process.exit(1);
  }
}

deduplicate();
