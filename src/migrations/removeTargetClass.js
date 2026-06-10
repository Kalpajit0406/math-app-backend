/**
 * Migration Script: Remove targetClass from Announcement Collection
 * File: src/migrations/removeTargetClass.js
 * 
 * Idempotent, safe database migration using Mongoose.
 */

const mongoose = require('mongoose');
const Announcement = require('../models/announcementModel');

async function migrate() {
  console.log('[Migration] Starting removeTargetClass migration...');

  try {
    const announcements = await Announcement.collection.find({}).toArray();
    let modifiedCount = 0;

    for (const ann of announcements) {
      const targetClass = ann.targetClass;
      let targetClassIds = ann.targetClassIds;

      if (targetClass !== undefined) {
        // If targetClassIds is missing or empty, map targetClass value
        if (!targetClassIds || targetClassIds.length === 0) {
          if (targetClass === 'all' || !targetClass) {
            targetClassIds = [9, 10, 11, 12, 13];
          } else {
            const num = Number(targetClass);
            targetClassIds = !isNaN(num) ? [num] : [];
          }
        }

        // Apply change to database and unset targetClass field
        await Announcement.collection.updateOne(
          { _id: ann._id },
          {
            $set: { targetClassIds },
            $unset: { targetClass: '' }
          }
        );
        modifiedCount++;
      }
    }

    console.log(`[Migration] Completed successfully. Updated ${modifiedCount} announcements.`);
    return { success: true, modifiedCount };
  } catch (error) {
    console.error('[Migration] Error during migration:', error.message);
    throw error;
  }
}

module.exports = { migrate };
