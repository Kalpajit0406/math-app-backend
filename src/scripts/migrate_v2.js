/**
 * Database Hardening & Normalization Migration Script (v2)
 * Performs backups, converts schema structures, validates integrity, and supports rollback.
 */

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const connectDB = require('../config/db');
const Student = require('../models/studentModel');
const Exam = require('../models/examModel');
const Question = require('../models/questionModel');
const Chapter = require('../models/chapterModel');
const StudentPerformance = require('../models/studentPerformanceModel');
const OCRJob = require('../models/ocrJobModel');

// In-memory backup arrays for rollback
let backupStudents = [];
let backupExams = [];
let backupPerformances = [];
let backupOCRJobs = [];

async function backupData() {
  console.log('--- Phase 1: Creating in-memory data backups ---');
  backupStudents = await Student.collection.find({}).toArray();
  backupExams = await Exam.collection.find({}).toArray();
  backupPerformances = await StudentPerformance.collection.find({}).toArray();
  backupOCRJobs = await OCRJob.collection.find({}).toArray();
  console.log(`Backups completed: Students(${backupStudents.length}), Exams(${backupExams.length}), Performances(${backupPerformances.length}), OCRJobs(${backupOCRJobs.length})`);
}

async function rollback() {
  console.warn('!!! MIGRATION FAILURE DETECTED: ROLLING BACK ALL CHANGES !!!');
  
  // Restore Students using native collection to bypass Mongoose validation
  await Student.collection.deleteMany({});
  if (backupStudents.length > 0) {
    await Student.collection.insertMany(backupStudents);
  }
  
  // Restore Exams using native collection
  await Exam.collection.deleteMany({});
  if (backupExams.length > 0) {
    await Exam.collection.insertMany(backupExams);
  }
  
  // Restore Student Performances using native collection
  await StudentPerformance.collection.deleteMany({});
  if (backupPerformances.length > 0) {
    await StudentPerformance.collection.insertMany(backupPerformances);
  }
  
  // Restore OCR Jobs using native collection
  await OCRJob.collection.deleteMany({});
  if (backupOCRJobs.length > 0) {
    await OCRJob.collection.insertMany(backupOCRJobs);
  }
  
  console.log('Rollback finished successfully.');
}

async function migrateStudents() {
  console.log('--- Phase 2: Migrating Student Schemas (Flag Normalization) ---');
  const students = await Student.find({});
  for (const student of students) {
    // 1. Account type conversion
    let accountType = student.accountType || 'NORMAL';
    if (student.role === 'admin') {
      accountType = 'ADMIN';
    } else if (student.isJoint) {
      accountType = 'JOINT';
    }
    
    // 2. Account status conversion
    let accountStatus = 'PENDING';
    if (student.verified) {
      accountStatus = 'APPROVED';
    } else if (student.isRejected) {
      accountStatus = 'REJECTED';
    } else if (student.accountType === 'BLOCKED') {
      accountStatus = 'SUSPENDED';
    }
    
    // Populate default permissions schema
    const DEFAULT_PERMISSIONS = {
      TRIAL: { canAccessExams: false, canAccessTeacherExams: false, canGeneratePractice: true, canReceiveNotifications: false, canViewPremiumAnalytics: false, canAccessLeaderboard: false, canJoinJointEntrance: false },
      NORMAL: { canAccessExams: true, canAccessTeacherExams: true, canGeneratePractice: true, canReceiveNotifications: true, canViewPremiumAnalytics: false, canAccessLeaderboard: true, canJoinJointEntrance: false },
      JOINT: { canAccessExams: true, canAccessTeacherExams: true, canGeneratePractice: true, canReceiveNotifications: true, canViewPremiumAnalytics: true, canAccessLeaderboard: true, canJoinJointEntrance: true },
      JOINT_ENTRANCE: { canAccessExams: true, canAccessTeacherExams: true, canGeneratePractice: true, canReceiveNotifications: true, canViewPremiumAnalytics: true, canAccessLeaderboard: true, canJoinJointEntrance: true },
      PREMIUM: { canAccessExams: true, canAccessTeacherExams: true, canGeneratePractice: true, canReceiveNotifications: true, canViewPremiumAnalytics: true, canAccessLeaderboard: true, canJoinJointEntrance: true },
      ADMIN: { canAccessExams: true, canAccessTeacherExams: true, canGeneratePractice: true, canReceiveNotifications: true, canViewPremiumAnalytics: true, canAccessLeaderboard: true, canJoinJointEntrance: true },
      BLOCKED: { canAccessExams: false, canAccessTeacherExams: false, canGeneratePractice: false, canReceiveNotifications: false, canViewPremiumAnalytics: false, canAccessLeaderboard: false, canJoinJointEntrance: false }
    };
    const permissions = DEFAULT_PERMISSIONS[accountType] || DEFAULT_PERMISSIONS.NORMAL;

    // Use native collection update to set new fields and unset deprecated flags
    await Student.collection.updateOne(
      { _id: student._id },
      { 
        $set: { accountType, accountStatus, permissions },
        $unset: { isJoint: 1, verified: 1, isRejected: 1, trialApproved: 1, role: 1 } 
      }
    );
  }
  console.log(`Successfully migrated ${students.length} student documents.`);
}

async function migrateExamsAndQuestions() {
  console.log('--- Phase 3: Migrating Exams & Normalizing Questions ---');
  const exams = await Exam.find({});
  
  for (const exam of exams) {
    const questionIds = [];
    
    // If exam has nested questions array, migrate them to Question collection
    if (exam.questions && exam.questions.length > 0) {
      for (const q of exam.questions) {
        // Resolve a default chapterId
        let chap = await Chapter.findOne({ classId: exam.classNo || 12 });
        if (!chap) {
          chap = await Chapter.create({
            classId: exam.classNo || 12,
            chapterName: exam.chapters?.[0] || 'General Mathematics'
          });
        }
        
        // Find existing or save nested question as standalone Question
        let questionDoc = await Question.findOne({ question: q.questionText, classNo: exam.classNo });
        if (!questionDoc) {
          questionDoc = new Question({
            language: exam.language || 'English',
            classNo: exam.classNo || 12,
            chapterId: chap._id,
            question: q.questionText,
            options: q.options && q.options.length === 4 ? q.options : ['A', 'B', 'C', 'D'],
            correctAnswer: q.correctAnswer || 'A'
          });
          await questionDoc.save({ validateBeforeSave: false });
        }
        questionIds.push(questionDoc._id);
      }
    }
    
    // Update Exam to point to questionIds and unset nested questions using native collection
    await Exam.collection.updateOne(
      { _id: exam._id },
      { 
        $set: { questionIds },
        $unset: { questions: 1 } 
      }
    );
  }
  console.log(`Successfully migrated ${exams.length} exams.`);
}

async function migratePerformances() {
  console.log('--- Phase 4: Normalizing Student Performance (Mobile -> ID) ---');
  const performances = await StudentPerformance.find({});
  for (const perf of performances) {
    const mobile = perf.studentMobile || perf.get('studentMobile');
    if (mobile) {
      const student = await Student.findOne({ studentPhone: mobile });
      if (student) {
        await StudentPerformance.collection.updateOne(
          { _id: perf._id },
          { 
            $set: { studentId: student._id },
            $unset: { studentMobile: 1 } 
          }
        );
      } else {
        console.warn(`Orphaned performance record: No student found with phone ${mobile}. Deleting.`);
        await StudentPerformance.collection.deleteOne({ _id: perf._id });
      }
    }
  }
  console.log('Performance normalization completed.');
}

async function migrateOCRJobs() {
  console.log('--- Phase 5: Normalizing OCRJobs (Buffer Extraction & TTL) ---');
  const jobs = await OCRJob.find({});
  const tempDir = path.join(__dirname, '../../public/temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  for (const job of jobs) {
    let filePath = job.filePath;
    
    // 1. If buffer exists, write it to disk
    const buffer = job.buffer || job.get('buffer');
    if (buffer && buffer.length > 0) {
      const ext = job.filename?.split('.').pop() || 'jpg';
      const diskPath = path.join(tempDir, `ocr-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`);
      fs.writeFileSync(diskPath, buffer);
      filePath = diskPath;
    }
    
    // 2. Set default expiresAt for TTL if not defined
    const expiresAt = job.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    await OCRJob.collection.updateOne(
      { _id: job._id },
      { 
        $set: { filePath, expiresAt },
        $unset: { buffer: 1 } 
      }
    );
  }
  console.log(`Migrated ${jobs.length} OCR jobs.`);
}

async function runMigration() {
  try {
    await connectDB();
    console.log('Connected to MongoDB.');
    
    await backupData();
    
    await migrateStudents();
    await migrateExamsAndQuestions();
    await migratePerformances();
    await migrateOCRJobs();
    
    console.log('--- Phase 6: Validating migrated data consistency ---');
    const studentCheck = await Student.collection.findOne({ verified: { $exists: true } });
    const examCheck = await Exam.collection.findOne({ questions: { $exists: true } });
    const ocrCheck = await OCRJob.collection.findOne({ buffer: { $exists: true } });
    const perfCheck = await StudentPerformance.collection.findOne({ studentMobile: { $exists: true } });
    
    if (studentCheck || examCheck || ocrCheck || perfCheck) {
      throw new Error('Consistency validation failed: deprecated fields are still present in schema.');
    }
    
    console.log('✅ DATABASE REFRACTOR MIGRATION COMPLETED SUCCESSFULLY!');
    process.exit(0);
  } catch (error) {
    console.error('❌ MIGRATION ERROR:', error);
    try {
      await rollback();
    } catch (rbError) {
      console.error('Fatal rollback error:', rbError);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  runMigration();
}

module.exports = { runMigration, rollback };
