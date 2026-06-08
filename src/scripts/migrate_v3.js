/**
 * Database Hardening Migration Script (v3)
 * Handles:
 * 1. Removing targetClass from Announcements & mapping to targetClassIds.
 * 2. Splitting inline verification session items to VerificationSessionItem collection.
 * 3. Archiving raw OCR texts to OcrArchive and saving compact summaries in VerificationSessionItem.
 * 4. Normalizing password security parameters (failedLoginAttempts, lastFailedLoginAt, passwordAlgorithm).
 * 5. Rollback support & Validation.
 */

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Announcement = require('../models/announcementModel');
const VerificationSession = require('../models/verificationSessionModel');
const VerificationSessionItem = require('../models/verificationSessionItemModel');
const OcrArchive = require('../models/ocrArchiveModel');
const Student = require('../models/studentModel');
const User = require('../models/userModel');

// In-memory backups
let backupAnnouncements = [];
let backupSessions = [];
let backupSessionItems = [];
let backupArchives = [];
let backupStudents = [];
let backupUsers = [];

async function createBackups() {
  console.log('--- Phase 1: Creating in-memory backups ---');
  backupAnnouncements = await Announcement.collection.find({}).toArray();
  backupSessions = await VerificationSession.collection.find({}).toArray();
  try {
    backupSessionItems = await VerificationSessionItem.collection.find({}).toArray();
  } catch (err) {
    backupSessionItems = [];
  }
  try {
    backupArchives = await OcrArchive.collection.find({}).toArray();
  } catch (err) {
    backupArchives = [];
  }
  backupStudents = await Student.collection.find({}).toArray();
  backupUsers = await User.collection.find({}).toArray();

  console.log(`Backups completed: Announcements(${backupAnnouncements.length}), Sessions(${backupSessions.length}), SessionItems(${backupSessionItems.length}), OcrArchives(${backupArchives.length}), Students(${backupStudents.length}), Users(${backupUsers.length})`);
}

async function rollback() {
  console.warn('!!! MIGRATION FAILURE DETECTED: ROLLING BACK ALL CHANGES !!!');

  await Announcement.collection.deleteMany({});
  if (backupAnnouncements.length > 0) {
    await Announcement.collection.insertMany(backupAnnouncements);
  }

  await VerificationSession.collection.deleteMany({});
  if (backupSessions.length > 0) {
    await VerificationSession.collection.insertMany(backupSessions);
  }

  await VerificationSessionItem.collection.deleteMany({});
  if (backupSessionItems.length > 0) {
    await VerificationSessionItem.collection.insertMany(backupSessionItems);
  }

  await OcrArchive.collection.deleteMany({});
  if (backupArchives.length > 0) {
    await OcrArchive.collection.insertMany(backupArchives);
  }

  await Student.collection.deleteMany({});
  if (backupStudents.length > 0) {
    await Student.collection.insertMany(backupStudents);
  }

  await User.collection.deleteMany({});
  if (backupUsers.length > 0) {
    await User.collection.insertMany(backupUsers);
  }

  console.log('Rollback finished successfully.');
}

async function migrateAnnouncements() {
  console.log('--- Phase 2: Migrating Announcements (Stripping targetClass, using targetClassIds) ---');
  const announcements = await Announcement.collection.find({}).toArray();
  let modifiedCount = 0;
  for (const ann of announcements) {
    let targetClassIds = ann.targetClassIds;
    const targetClass = ann.targetClass;
    
    if (targetClass !== undefined) {
      if (!targetClassIds || targetClassIds.length === 0) {
        if (targetClass === 'all') {
          targetClassIds = [9, 10, 11, 12, 13];
        } else {
          const num = Number(targetClass);
          targetClassIds = !isNaN(num) ? [num] : [];
        }
      }
      
      await Announcement.collection.updateOne(
        { _id: ann._id },
        { 
          $set: { targetClassIds },
          $unset: { targetClass: "" }
        }
      );
      modifiedCount++;
    }
  }
  console.log(`Announcements migration finished: Updated ${modifiedCount} announcements.`);
}

async function migrateVerificationSessions() {
  console.log('--- Phase 3: Migrating Verification Sessions & Archiving Raw OCR ---');
  const sessions = await VerificationSession.collection.find({}).toArray();
  let splitCount = 0;
  let archiveCount = 0;

  for (const sess of sessions) {
    const inlineItems = sess.items || [];
    if (inlineItems.length > 0) {
      const itemsToInsert = [];
      const archivesToInsert = [];
      const expiresAt = sess.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000);

      inlineItems.forEach((item, idx) => {
        const itemId = item._id || new mongoose.Types.ObjectId();
        const rawOcrData = item.rawOcrData || {};
        const rawText = rawOcrData.rawText || item.rawChunk || '';

        // Generate hash and summary
        const crypto = require('crypto');
        const ocrHash = crypto.createHash('sha256').update(rawText).digest('hex');
        const summary = (item.questionText || '').substring(0, 100);

        const compactOcrData = {
          ocrConfidence: item.confidenceScores?.ocrConfidence || rawOcrData.confidence || null,
          summary,
          ocrHash,
          sourceUsed: rawOcrData.sourceUsed || 'unknown'
        };

        itemsToInsert.push({
          _id: itemId,
          sessionId: sess.sessionId,
          questionText: item.questionText || '',
          options: item.options || [],
          questionNumber: item.questionNumber || String(idx + 1),
          detectionOrder: item.detectionOrder || (idx + 1),
          format: item.format || 'mcq',
          confidenceScores: item.confidenceScores || {},
          rawOcrData: compactOcrData,
          verified: item.verified || false,
          verifiedAt: item.verifiedAt,
          isDeleted: item.isDeleted || false,
          extractionState: item.extractionState || 'ACCEPTED',
          validationErrors: item.validationErrors || [],
          validationWarnings: item.validationWarnings || [],
          duplicateInfo: item.duplicateInfo || {},
          expiresAt
        });

        if (Object.keys(rawOcrData).length > 0) {
          archivesToInsert.push({
            sessionId: sess.sessionId,
            itemId,
            rawOcrData
          });
        }
      });

      if (itemsToInsert.length > 0) {
        await VerificationSessionItem.insertMany(itemsToInsert);
        splitCount += itemsToInsert.length;
      }
      if (archivesToInsert.length > 0) {
        await OcrArchive.insertMany(archivesToInsert);
        archiveCount += archivesToInsert.length;
      }

      // Strip inline items array
      await VerificationSession.collection.updateOne(
        { _id: sess._id },
        { $unset: { items: "" } }
      );
    }
  }

  console.log(`Verification sessions split finished: Split ${splitCount} items and archived ${archiveCount} raw OCR texts.`);
}

async function migratePasswordParameters() {
  console.log('--- Phase 4: Migrating Password Hardening Parameters ---');
  
  // Student updates
  const studentResult = await Student.collection.updateMany(
    { 
      $or: [
        { passwordAlgorithm: { $exists: false } },
        { failedLoginAttempts: { $exists: false } },
        { lastFailedLoginAt: { $exists: false } }
      ]
    },
    {
      $set: {
        passwordAlgorithm: 'bcrypt',
        failedLoginAttempts: 0,
        lastFailedLoginAt: null
      }
    }
  );

  // User updates
  const userResult = await User.collection.updateMany(
    { 
      $or: [
        { passwordAlgorithm: { $exists: false } },
        { failedLoginAttempts: { $exists: false } },
        { lastFailedLoginAt: { $exists: false } }
      ]
    },
    {
      $set: {
        passwordAlgorithm: 'bcrypt',
        failedLoginAttempts: 0,
        lastFailedLoginAt: null
      }
    }
  );

  console.log(`Password parameters migration finished: Updated ${studentResult.modifiedCount} student and ${userResult.modifiedCount} user documents.`);
}

async function run() {
  try {
    await connectDB();
    console.log('Connected to Database successfully.');

    await createBackups();

    await migrateAnnouncements();
    await migrateVerificationSessions();
    await migratePasswordParameters();

    console.log('--- Phase 5: Verification & Integrity check ---');
    const badAnn = await Announcement.collection.findOne({ targetClass: { $exists: true } });
    if (badAnn) {
      throw new Error('Validation failed: Some announcement documents still have targetClass.');
    }

    const badSess = await VerificationSession.collection.findOne({ items: { $exists: true } });
    if (badSess) {
      throw new Error('Validation failed: Some verification session documents still contain inline items.');
    }

    console.log('✅ DATABASE HARDENING MIGRATION COMPLETED SUCCESSFULLY!');
    process.exit(0);
  } catch (error) {
    console.error('❌ MIGRATION ERROR:', error.message);
    await rollback();
    process.exit(1);
  }
}

if (require.main === module) {
  run();
}

module.exports = { run, rollback };
