/**
 * Production Hardening Database Migration Script
 * Handles stripping legacy/deprecated fields, normalizing exams, and password hashing migration.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const connectDB = require('../config/db');
const Student = require('../models/studentModel');
const Exam = require('../models/examModel');
const Question = require('../models/questionModel');
const Chapter = require('../models/chapterModel');
const { resolveChapterIds } = require('../utils/chapterNormalization');

// In-memory backups
let backupStudents = [];
let backupExams = [];
let backupQuestions = [];

async function createBackups() {
  console.log('--- Phase 1: Creating in-memory backups ---');
  backupStudents = await Student.collection.find({}).toArray();
  backupExams = await Exam.collection.find({}).toArray();
  backupQuestions = await Question.collection.find({}).toArray();
  console.log(`Backups created: Students(${backupStudents.length}), Exams(${backupExams.length}), Questions(${backupQuestions.length})`);
}

async function rollback() {
  console.warn('!!! MIGRATION FAILURE DETECTED: ROLLING BACK ALL CHANGES !!!');
  
  await Student.collection.deleteMany({});
  if (backupStudents.length > 0) {
    await Student.collection.insertMany(backupStudents);
  }
  await Exam.collection.deleteMany({});
  if (backupExams.length > 0) {
    await Exam.collection.insertMany(backupExams);
  }
  
  await Question.collection.deleteMany({});
  if (backupQuestions.length > 0) {
    await Question.collection.insertMany(backupQuestions);
  }
  
  console.log('Rollback completed successfully.');
}

async function migrateQuestions() {
  console.log('--- Phase 2: Migrating Questions (Stripping Physical "chapter" Field) ---');
  const questions = await Question.collection.find({}).toArray();
  let modifiedCount = 0;
  for (const q of questions) {
    if (q.chapter !== undefined) {
      // Unset chapter physical field, rely on dynamic resolution/virtual
      await Question.collection.updateOne(
        { _id: q._id },
        { $unset: { chapter: "" } }
      );
      modifiedCount++;
    }
  }
  console.log(`Questions migration finished: Unset physical "chapter" field in ${modifiedCount} questions.`);
}

async function migrateExams() {
  console.log('--- Phase 3: Migrating Exams (Converting "chapters" to "chapterIds") ---');
  const exams = await Exam.collection.find({}).toArray();
  let modifiedCount = 0;
  for (const ex of exams) {
    const updateOp = {};
    const setPayload = {};
    
    if (Array.isArray(ex.chapters) && ex.chapters.length > 0) {
      const classNo = ex.classNo || 10;
      const chapterIds = await resolveChapterIds(classNo, ex.chapters);
      setPayload.chapterIds = chapterIds;
    } else if (!ex.chapterIds) {
      setPayload.chapterIds = [];
    }

    if (Object.keys(setPayload).length > 0) {
      updateOp.$set = setPayload;
    }
    // Always unset physical chapters field if it exists at all
    updateOp.$unset = { chapters: "" };

    await Exam.collection.updateOne({ _id: ex._id }, updateOp);
    modifiedCount++;
  }
  console.log(`Exams migration finished: Normalised ${modifiedCount} exams to chapterIds.`);
}

async function migrateStudents() {
  console.log('--- Phase 4: Migrating Students (Password Hardening & Fingerprints) ---');
  const students = await Student.collection.find({}).toArray();
  let modifiedCount = 0;
  for (const s of students) {
    const updatePayload = {};
    const unsetPayload = {};

    // 1. Migrate legacy "password" plain text or hash to "passwordHash"
    if (s.password !== undefined) {
      let hash = s.password;
      // If it's not already hashed, hash it
      if (typeof hash === 'string' && !hash.startsWith('$2a$') && !hash.startsWith('$2b$') && !hash.startsWith('$2y$')) {
        hash = await bcrypt.hash(hash, 10);
      }
      updatePayload.passwordHash = hash;
      updatePayload.passwordChangedAt = s.passwordChangedAt || new Date();
      unsetPayload.password = "";
    } else if (s.passwordHash) {
      // Ensure passwordHash is present and formatted
      let hash = s.passwordHash;
      if (typeof hash === 'string' && !hash.startsWith('$2a$') && !hash.startsWith('$2b$') && !hash.startsWith('$2y$')) {
        hash = await bcrypt.hash(hash, 10);
        updatePayload.passwordHash = hash;
      }
    }

    // 2. Set default fingerprint fields
    if (s.fingerprintHash === undefined) {
      updatePayload.fingerprintHash = "";
    }
    if (s.lastKnownDevices === undefined) {
      updatePayload.lastKnownDevices = [];
    }

    if (Object.keys(updatePayload).length > 0 || Object.keys(unsetPayload).length > 0) {
      const updateOp = {};
      if (Object.keys(updatePayload).length > 0) updateOp.$set = updatePayload;
      if (Object.keys(unsetPayload).length > 0) updateOp.$unset = unsetPayload;
      
      await Student.collection.updateOne({ _id: s._id }, updateOp);
      modifiedCount++;
    }
  }
  console.log(`Students migration finished: Normalised ${modifiedCount} students.`);
}



async function run() {
  try {
    await connectDB();
    await createBackups();
    
    await migrateQuestions();
    await migrateExams();
    await migrateStudents();
    
    console.log('--- Phase 6: Validation ---');
    // Ensure all students have passwordHash, no password field, fingerprint fields set
    const badStudents = await Student.collection.find({
      $or: [
        { passwordHash: { $exists: false } },
        { password: { $exists: true } },
        { fingerprintHash: { $exists: false } }
      ]
    }).toArray();
    
    if (badStudents.length > 0) {
      throw new Error(`Validation failed: ${badStudents.length} student documents did not match production requirements.`);
    }

    // Ensure all questions do not have a physical "chapter" field
    const badQuestions = await Question.collection.find({ chapter: { $exists: true } }).toArray();
    if (badQuestions.length > 0) {
      throw new Error(`Validation failed: ${badQuestions.length} questions still contain physical "chapter" fields.`);
    }

    // Ensure all exams do not have a physical "chapters" field
    const badExams = await Exam.collection.find({ chapters: { $exists: true } }).toArray();
    if (badExams.length > 0) {
      throw new Error(`Validation failed: ${badExams.length} exams still contain physical "chapters" fields.`);
    }

    console.log('=== MIGRATION COMPLETED SUCCESSFULLY ===');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed during execution:', error);
    await rollback();
    process.exit(1);
  }
}

run();
