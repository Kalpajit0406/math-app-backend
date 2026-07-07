const Chapter = require('../models/chapterModel');
const Question = require('../models/questionModel');
const Exam = require('../models/examModel');
const TestConfig = require('../models/testConfigModel');
const SyncVersion = require('../models/syncVersionModel');
const mongoose = require('mongoose');
const { normalizeChapterName } = require('../utils/chapterNormalization');

// Helper to increment chapter sync version
const incrementSyncVersion = async () => {
  try {
    await SyncVersion.findOneAndUpdate(
      { key: 'chapterVersion' },
      { $inc: { value: 1 } },
      { upsert: true, returnDocument: 'after' }
    );
  } catch (error) {
    console.error('Failed to increment chapter sync version:', error.message);
  }
};

// 1. Get Chapters (filtered by classId if provided)
const getChapters = async (req, res) => {
  try {
    const { classId } = req.query;
    const filter = {};
    if (classId) {
      const { getClassIdFromNo } = require('../utils/classCache');
      const classObjId = mongoose.Types.ObjectId.isValid(classId) ? classId : getClassIdFromNo(classId);
      if (classObjId) {
        filter.classId = classObjId;
      } else {
        filter.classId = new mongoose.Types.ObjectId(); // force empty match
      }
    }

    filter.isDeleted = { $ne: true };
    const chapters = await Chapter.find(filter).sort({ classId: 1, chapterName: 1 });
    res.json({
      success: true,
      data: chapters
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Add Chapter
const addChapter = async (req, res) => {
  try {
    console.log('[DEBUG addChapter] req.body:', JSON.stringify(req.body));
    const { classId, chapterName } = req.body;
    if (!classId || !chapterName) {
      return res.status(400).json({ success: false, message: 'classId and chapterName are required.' });
    }

    let finalChapterName = chapterName.trim();
    const { getClassIdFromNo, getClassNoFromId } = require('../utils/classCache');
    
    let classObjectId = mongoose.Types.ObjectId.isValid(classId) ? classId : getClassIdFromNo(classId);
    let numericClassId = mongoose.Types.ObjectId.isValid(classId) ? getClassNoFromId(classId) : parseInt(classId, 10);

    const Class = mongoose.model('Class');
    // Fallback: If cache lookup failed, query the database directly
    if (mongoose.Types.ObjectId.isValid(classId)) {
      if (!numericClassId) {
        const classDoc = await Class.findById(classId);
        if (classDoc) {
          numericClassId = Number(classDoc.classId);
        }
      }
    } else {
      if (!classObjectId) {
        const classDoc = await Class.findOne({ classId: parseInt(classId, 10) });
        if (classDoc) {
          classObjectId = classDoc._id;
        }
      }
    }

    if (!classObjectId) {
      return res.status(400).json({ success: false, message: 'Invalid classId.' });
    }

    if (numericClassId === 13) {
      let { parentChapter } = req.body;
      // Extract parentChapter from chapterName if not provided (e.g., "12: Probability" -> parentChapter = "12")
      if (!parentChapter && typeof chapterName === 'string') {
        const match = chapterName.trim().match(/^(11|12|JEE):\s*(.*)/i);
        if (match) {
          parentChapter = match[1].toUpperCase();
        }
      }
      if (!parentChapter || !['11', '12', 'JEE'].includes(parentChapter)) {
        return res.status(400).json({ success: false, message: 'parentChapter ("11", "12", or "JEE") is required for class 13.' });
      }
      const cleanChapterName = chapterName.replace(/^(11|12|JEE):\s*/i, '').trim();
      finalChapterName = `${parentChapter}: ${cleanChapterName}`;
    }

    const normalized = normalizeChapterName(finalChapterName);
    const existing = await Chapter.findOne({ classId: classObjectId, normalizedChapterName: normalized });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Chapter name already exists for this class.' });
    }

    const newChapter = await Chapter.create({
      classId: classObjectId,
      chapterName: finalChapterName
    });

    await incrementSyncVersion();

    res.status(201).json({
      success: true,
      data: newChapter
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. Edit Chapter (Rename or Delete all questions)
const editChapter = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { id } = req.params;
    const { chapterName, action } = req.body; // action: 'rename' or 'delete_questions'

    if (!action || !['rename', 'delete_questions'].includes(action)) {
      return res.status(400).json({ success: false, message: "Valid action ('rename' or 'delete_questions') is required." });
    }

    const chapter = await Chapter.findById(id);
    if (!chapter) {
      return res.status(404).json({ success: false, message: 'Chapter not found.' });
    }

    const oldChapterName = chapter.chapterName;
    const classId = chapter.classId;

    if (action === 'rename') {
      if (!chapterName) {
        return res.status(400).json({ success: false, message: 'chapterName is required for renaming.' });
      }

      const normalized = normalizeChapterName(chapterName);
      // Check if another active chapter has this name
      const duplicate = await Chapter.findOne({
        classId,
        normalizedChapterName: normalized,
        _id: { $ne: id },
        isDeleted: { $ne: true }
      });

      if (duplicate) {
        if (req.body.confirmMerge !== true) {
          return res.status(200).json({
            success: false,
            code: 'CHAPTER_ALREADY_EXISTS',
            message: `Another chapter named "${duplicate.chapterName}" already exists for this class. Proceeding will merge all questions from "${oldChapterName}" into it. Do you want to proceed?`
          });
        }

        // Proceed to merge!
        let transactionStarted = false;
        try {
          await session.startTransaction();
          transactionStarted = true;
        } catch (err) {
          // Replica sets not enabled, proceed without transaction
        }

        // 1. Move all questions from old chapter to target chapter
        await Question.updateMany(
          { chapterId: id },
          { chapterId: duplicate._id },
          { session: transactionStarted ? session : undefined }
        );

        // 2. Update all Exams referencing old chapter
        const exams = await Exam.find({ chapterIds: id });
        for (const exam of exams) {
          const filtered = exam.chapterIds.filter(chId => chId.toString() !== id.toString());
          if (!filtered.some(chId => chId.toString() === duplicate._id.toString())) {
            filtered.push(duplicate._id);
          }
          exam.chapterIds = filtered;
          await exam.save({ session: transactionStarted ? session : undefined });
        }

        // 3. Update all TestConfigs referencing old chapter
        const configs = await TestConfig.find({ chapterIds: id });
        for (const config of configs) {
          const filtered = config.chapterIds.filter(chId => chId.toString() !== id.toString());
          if (!filtered.some(chId => chId.toString() === duplicate._id.toString())) {
            filtered.push(duplicate._id);
          }
          config.chapterIds = filtered;
          await config.save({ session: transactionStarted ? session : undefined });
        }

        // 4. Soft delete the source chapter
        chapter.isDeleted = true;
        chapter.deletedAt = new Date();
        chapter.deletedBy = req.user?.id;
        chapter.chapterName = `${chapter.chapterName} (merged)`;
        await chapter.save({ session: transactionStarted ? session : undefined });

        if (transactionStarted) {
          await session.commitTransaction();
        }

        await incrementSyncVersion();

        // Log audit log for merge action
        const auditLogService = require('../services/auditLogService');
        await auditLogService.log({
          actorId: req.user.id,
          action: 'chapter_merge',
          targetType: 'Chapter',
          targetId: duplicate._id,
          metadata: {
            sourceChapterId: id,
            sourceChapterName: oldChapterName,
            targetChapterName: duplicate.chapterName,
            classId
          }
        });

        return res.json({
          success: true,
          message: 'Chapters merged successfully.',
          data: duplicate
        });
      }

      // No duplicate: perform regular rename
      let transactionStarted = false;
      try {
        await session.startTransaction();
        transactionStarted = true;
      } catch (err) {
        // Replica sets not enabled, proceed without transaction
      }

      chapter.chapterName = chapterName.trim();
      await chapter.save({ session: transactionStarted ? session : undefined });

      if (transactionStarted) {
        await session.commitTransaction();
      }

      await incrementSyncVersion();

      // Log audit action
      const auditLogService = require('../services/auditLogService');
      await auditLogService.log({
        actorId: req.user.id,
        action: 'chapter_rename',
        targetType: 'Chapter',
        targetId: chapter._id,
        metadata: {
          oldName: oldChapterName,
          newName: chapterName.trim(),
          classId
        }
      });

      res.json({
        success: true,
        message: 'Chapter and references updated successfully.',
        data: chapter
      });

    } else if (action === 'delete_questions') {
      // Option 2: Delete chapter and all questions in this chapter
      let transactionStarted = false;
      try {
        await session.startTransaction();
        transactionStarted = true;
      } catch (err) {}

      // Soft-delete questions cascading
      await Question.updateMany(
        { chapterId: id },
        { isDeleted: true, deletedAt: new Date(), deletedBy: req.user?.id },
        { session: transactionStarted ? session : undefined }
      );

      // Soft-delete chapter
      await Chapter.findByIdAndUpdate(
        id,
        { isDeleted: true, deletedAt: new Date(), deletedBy: req.user?.id },
        { session: transactionStarted ? session : undefined }
      );

      // Soft-delete exams referencing this chapter
      await Exam.updateMany(
        { chapterIds: id },
        { isDeleted: true, deletedAt: new Date(), deletedBy: req.user?.id },
        { session: transactionStarted ? session : undefined }
      );

      // Soft-delete test configs referencing this chapter
      await TestConfig.updateMany(
        { chapterIds: id },
        { isDeleted: true, deletedAt: new Date(), deletedBy: req.user?.id },
        { session: transactionStarted ? session : undefined }
      );

      if (transactionStarted) {
        await session.commitTransaction();
      }

      await incrementSyncVersion();

      // Log audit action
      const auditLogService = require('../services/auditLogService');
      await auditLogService.log({
        actorId: req.user.id,
        action: 'chapter_deletion',
        targetType: 'Chapter',
        targetId: id,
        metadata: {
          chapterName: oldChapterName,
          classId,
          cascadeDeletedQuestions: true
        }
      });

      res.json({
        success: true,
        message: 'Chapter and all linked questions deleted successfully.'
      });
    }


  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

// 4. Delete Chapter (cascading delete)
const deleteChapter = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { id } = req.params;
    const chapter = await Chapter.findById(id);
    if (!chapter) {
      return res.status(404).json({ success: false, message: 'Chapter not found.' });
    }

    const oldChapterName = chapter.chapterName;
    const classId = chapter.classId;

    let transactionStarted = false;
    try {
      await session.startTransaction();
      transactionStarted = true;
    } catch (err) {}

    // Cascade soft-delete questions
    await Question.updateMany(
      { chapterId: id },
      { isDeleted: true, deletedAt: new Date(), deletedBy: req.user?.id },
      { session: transactionStarted ? session : undefined }
    );

    // Soft-delete chapter entry
    await Chapter.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date(), deletedBy: req.user?.id },
      { session: transactionStarted ? session : undefined }
    );

    // Soft-delete exams referencing this chapter
    await Exam.updateMany(
      { chapterIds: id },
      { isDeleted: true, deletedAt: new Date(), deletedBy: req.user?.id },
      { session: transactionStarted ? session : undefined }
    );

    // Soft-delete test configs referencing this chapter
    await TestConfig.updateMany(
      { chapterIds: id },
      { isDeleted: true, deletedAt: new Date(), deletedBy: req.user?.id },
      { session: transactionStarted ? session : undefined }
    );

    if (transactionStarted) {
      await session.commitTransaction();
    }

    await incrementSyncVersion();

    // Log audit action
    const auditLogService = require('../services/auditLogService');
    await auditLogService.log({
      actorId: req.user.id,
      action: 'chapter_deletion',
      targetType: 'Chapter',
      targetId: id,
      metadata: {
        chapterName: oldChapterName,
        classId,
        cascadeDeletedQuestions: true
      }
    });

    res.json({
      success: true,
      message: 'Chapter and linked questions deleted successfully (cascaded).'
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

// 5. Get Sync Version
const getSyncVersion = async (req, res) => {
  try {
    const versionDoc = await SyncVersion.findOne({ key: 'chapterVersion' });
    res.json({
      success: true,
      version: versionDoc ? versionDoc.value : 1
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 6. Get Question count for a Chapter
const getChapterUsage = async (req, res) => {
  try {
    const { id } = req.params;
    const count = await Question.countDocuments({ chapterId: id });
    res.json({
      success: true,
      count
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getChapters,
  addChapter,
  editChapter,
  deleteChapter,
  getSyncVersion,
  getChapterUsage
};
