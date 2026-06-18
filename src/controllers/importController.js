'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const ImportJob = require('../models/importJobModel');
const ImportItem = require('../models/importItemModel');
const Question = require('../models/questionModel');
const { ImportParserService, resolveClassAndChapter } = require('../services/importParserService');
const auditLogService = require('../services/auditLogService');

// Helper to check if a string is a valid MongoDB ObjectId
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

exports.uploadSource = async (req, res) => {
  try {
    const { importType, url, text } = req.body;
    if (!importType) {
      return res.status(400).json({ success: false, message: 'importType is required.' });
    }

    let sourceFileName = '';
    let rawSourceData = '';
    let metadata = {};

    if (['pdf', 'image'].includes(importType)) {
      if (!req.file) {
        return res.status(400).json({ success: false, message: `Upload file is required for ${importType} import.` });
      }
      sourceFileName = req.file.originalname;
      rawSourceData = req.file.path;
      metadata = { mimetype: req.file.mimetype, size: req.file.size };
    } else if (importType === 'url') {
      if (!url || !url.startsWith('http')) {
        return res.status(400).json({ success: false, message: 'A valid http/https URL is required.' });
      }
      sourceFileName = url.split('/').pop() || 'website';
      rawSourceData = url;
    } else if (['markdown', 'csv'].includes(importType)) {
      if (!text || text.trim().isEmpty) {
        return res.status(400).json({ success: false, message: 'Text data is required.' });
      }
      sourceFileName = `raw_${importType}_import.${importType === 'markdown' ? 'md' : 'csv'}`;
      rawSourceData = text;
    } else {
      return res.status(400).json({ success: false, message: `Invalid importType: ${importType}` });
    }

    const job = new ImportJob({
      userId: req.user?.id || req.user?._id,
      status: 'queued',
      importType,
      sourceFileName,
      rawSourceData,
      metadata
    });
    await job.save();

    // Trigger parser asynchronously in the background so request completes instantly
    setTimeout(() => {
      ImportParserService.processJob(job._id).catch(err => {
        console.error(`[ImportController] Background job ${job._id} processing failed:`, err);
      });
    }, 50);

    return res.status(202).json({
      success: true,
      message: 'Question import job has been queued successfully.',
      data: {
        jobId: job._id,
        status: job.status,
        importType: job.importType,
        sourceFileName: job.sourceFileName
      }
    });

  } catch (error) {
    console.error('[ImportController] uploadSource error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getJobs = async (req, res) => {
  try {
    const jobs = await ImportJob.find({}).sort({ createdAt: -1 }).limit(100);
    return res.json({ success: true, data: jobs });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    if (!isValidObjectId(jobId)) {
      return res.status(400).json({ success: false, message: 'Invalid jobId.' });
    }

    const job = await ImportJob.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Import job not found.' });
    }

    return res.json({ success: true, data: job });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getJobItems = async (req, res) => {
  try {
    const { jobId } = req.params;
    if (!isValidObjectId(jobId)) {
      return res.status(400).json({ success: false, message: 'Invalid jobId.' });
    }

    const items = await ImportItem.find({ jobId }).sort({ createdAt: 1 });
    return res.json({ success: true, data: items });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { questionText, options, correctAnswer, classNo, chapterName, language, explanation } = req.body;

    if (!isValidObjectId(itemId)) {
      return res.status(400).json({ success: false, message: 'Invalid itemId.' });
    }

    const item = await ImportItem.findById(itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Import item not found.' });
    }

    if (item.status !== 'pending_verification') {
      return res.status(400).json({ success: false, message: 'Cannot edit an item that has already been verified/saved.' });
    }

    // Apply updates
    if (questionText) item.questionText = questionText.trim();
    if (options) {
      if (!Array.isArray(options) || options.length !== 4) {
        return res.status(400).json({ success: false, message: 'Exactly 4 options are required.' });
      }
      item.options = options.map(o => String(o || '').trim());
    }
    if (correctAnswer) item.correctAnswer = correctAnswer.trim();
    if (classNo) item.classNo = Number(classNo);
    if (chapterName) item.chapterName = chapterName.trim();
    if (language) item.language = language;
    if (explanation !== undefined) item.explanation = explanation.trim();

    // Re-evaluate Duplicate Check after edits
    const { QuestionDuplicateDetector } = require('../services/questionDuplicateDetector');
    const dupCheck = await QuestionDuplicateDetector.checkDuplicate(
      item.questionText,
      item.classNo,
      item.options,
      item.correctAnswer
    );
    item.duplicateInfo = {
      detected: dupCheck.duplicateDetected,
      similarity: dupCheck.similarity,
      rating: dupCheck.rating,
      existingQuestionId: dupCheck.existingQuestion ? dupCheck.existingQuestion._id : null
    };

    await item.save();
    return res.json({ success: true, message: 'Item updated successfully.', data: item });

  } catch (error) {
    console.error('[ImportController] updateItem error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.confirmJobItems = async (req, res) => {
  try {
    const { jobId } = req.params;
    const { confirmItemIds, rejectItemIds } = req.body;

    if (!isValidObjectId(jobId)) {
      return res.status(400).json({ success: false, message: 'Invalid jobId.' });
    }

    const job = await ImportJob.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Import job not found.' });
    }

    if (!['preview_ready', 'partially_saved'].includes(job.status)) {
      return res.status(400).json({ success: false, message: 'Import job is not ready for confirmation.' });
    }

    let savedCount = 0;
    let failedCount = 0;
    let rejectedCount = 0;

    // 1. Process Rejections
    if (Array.isArray(rejectItemIds) && rejectItemIds.length > 0) {
      const result = await ImportItem.updateMany(
        { _id: { $in: rejectItemIds }, jobId, status: 'pending_verification' },
        { $set: { status: 'rejected' } }
      );
      rejectedCount += result.modifiedCount;
    }

    // 2. Process Confirmations (Save to production Questions schema)
    if (Array.isArray(confirmItemIds) && confirmItemIds.length > 0) {
      const itemsToConfirm = await ImportItem.find({
        _id: { $in: confirmItemIds },
        jobId,
        status: 'pending_verification'
      });

      for (const item of itemsToConfirm) {
        try {
          // Resolve class and chapter IDs dynamically
          const resolved = await resolveClassAndChapter(item.classNo, item.chapterName);

          const question = new Question({
            language: item.language,
            classId: resolved.classId,
            chapterId: resolved.chapterId,
            questionText: item.questionText,
            options: item.options,
            correctAnswer: item.correctAnswer,
            explanation: item.explanation
          });

          await question.save();

          // Mark import item as saved
          item.status = 'saved';
          item.errorMessage = null;
          await item.save();
          savedCount++;

          // Log audit details
          await auditLogService.log({
            actorId: req.user?.id || req.user?._id,
            action: 'import_question_confirm',
            targetType: 'Question',
            targetId: question._id,
            metadata: { jobId: job._id, itemId: item._id }
          });

        } catch (itemErr) {
          console.error(`[ImportController] Failed to confirm item ${item._id}:`, itemErr.message);
          item.errorMessage = itemErr.message;
          await item.save();
          failedCount++;
        }
      }
    }

    // Update parent job counters and status
    job.savedItems += savedCount;
    job.failedItems += failedCount;
    
    const remainingPending = await ImportItem.countDocuments({ jobId, status: 'pending_verification' });
    if (remainingPending === 0) {
      job.status = job.failedItems > 0 ? 'failed' : 'saved';
    } else {
      job.status = 'partially_saved';
    }
    await job.save();

    return res.json({
      success: true,
      message: 'Batch processing completed.',
      data: {
        saved: savedCount,
        rejected: rejectedCount,
        failed: failedCount,
        jobStatus: job.status
      }
    });

  } catch (error) {
    console.error('[ImportController] confirmJobItems error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
