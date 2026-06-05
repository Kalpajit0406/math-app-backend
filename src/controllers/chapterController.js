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
      { upsert: true, new: true }
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
      filter.classId = parseInt(classId, 10);
    }

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
    const { classId, chapterName } = req.body;
    if (!classId || !chapterName) {
      return res.status(400).json({ success: false, message: 'classId and chapterName are required.' });
    }

    const normalized = normalizeChapterName(chapterName);
    const existing = await Chapter.findOne({ classId: parseInt(classId, 10), normalizedChapterName: normalized });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Chapter name already exists for this class.' });
    }

    const newChapter = await Chapter.create({
      classId: parseInt(classId, 10),
      chapterName: chapterName.trim()
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
      // Check if another chapter has this name
      const duplicate = await Chapter.findOne({
        classId,
        normalizedChapterName: normalized,
        _id: { $ne: id }
      });
      if (duplicate) {
        return res.status(400).json({ success: false, message: 'Another chapter with this name already exists for this class.' });
      }

      // Start transaction if replica set is available, else fallback to standard execution
      let transactionStarted = false;
      try {
        await session.startTransaction();
        transactionStarted = true;
      } catch (err) {
        // Replica sets not enabled, proceed without transaction
      }

      chapter.chapterName = chapterName.trim();
      await chapter.save({ session: transactionStarted ? session : undefined });

      // Update linked questions
      await Question.updateMany(
        { chapterId: id },
        { chapter: chapterName.trim() },
        { session: transactionStarted ? session : undefined }
      );

      // Update exam references
      await Exam.updateMany(
        { classNo: classId, chapters: oldChapterName },
        { $set: { "chapters.$[elem]": chapterName.trim() } },
        { 
          arrayFilters: [{ elem: oldChapterName }],
          session: transactionStarted ? session : undefined 
        }
      );

      // Update test config references
      await TestConfig.updateMany(
        { classNo: classId, chapters: oldChapterName },
        { $set: { "chapters.$[elem]": chapterName.trim() } },
        { 
          arrayFilters: [{ elem: oldChapterName }],
          session: transactionStarted ? session : undefined 
        }
      );

      if (transactionStarted) {
        await session.commitTransaction();
      }

      await incrementSyncVersion();

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

      // Delete questions
      await Question.deleteMany(
        { chapterId: id },
        { session: transactionStarted ? session : undefined }
      );

      // Delete chapter
      await Chapter.findByIdAndDelete(id, { session: transactionStarted ? session : undefined });

      // Remove from exams
      await Exam.updateMany(
        { classNo: classId },
        { $pull: { chapters: oldChapterName } },
        { session: transactionStarted ? session : undefined }
      );

      // Remove from test configs
      await TestConfig.updateMany(
        { classNo: classId },
        { $pull: { chapters: oldChapterName } },
        { session: transactionStarted ? session : undefined }
      );

      if (transactionStarted) {
        await session.commitTransaction();
      }

      await incrementSyncVersion();

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

    // Cascade delete questions
    await Question.deleteMany(
      { chapterId: id },
      { session: transactionStarted ? session : undefined }
    );

    // Delete chapter entry
    await Chapter.findByIdAndDelete(id, { session: transactionStarted ? session : undefined });

    // Remove reference from exams
    await Exam.updateMany(
      { classNo: classId },
      { $pull: { chapters: oldChapterName } },
      { session: transactionStarted ? session : undefined }
    );

    // Remove reference from test configs
    await TestConfig.updateMany(
      { classNo: classId },
      { $pull: { chapters: oldChapterName } },
      { session: transactionStarted ? session : undefined }
    );

    if (transactionStarted) {
      await session.commitTransaction();
    }

    await incrementSyncVersion();

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
