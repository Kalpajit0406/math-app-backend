'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const ImportJob = require('../models/importJobModel');
const ImportItem = require('../models/importItemModel');
const Question = require('../models/questionModel');
const { ImportParserService, resolveClassAndChapter } = require('../services/importParserService');
const ImportNormalizerService = require('../services/importNormalizerService');
const { QuestionDuplicateDetector } = require('../services/questionDuplicateDetector');
const auditLogService = require('../services/auditLogService');

// Helper to check if a string is a valid MongoDB ObjectId
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/**
 * POST /imports
 * Create and queue import job
 */
exports.createImport = async (req, res) => {
  try {
    const sourceType = req.body.sourceType || req.body.importType;
    const url = req.body.url;
    const text = req.body.text;

    if (!sourceType) {
      return res.status(400).json({ success: false, message: 'sourceType is required.' });
    }

    const allowedTypes = ['pdf', 'image', 'url', 'markdown', 'csv'];
    if (!allowedTypes.includes(sourceType)) {
      return res.status(400).json({ success: false, message: `Invalid sourceType. Allowed: ${allowedTypes.join(', ')}` });
    }

    let originalFilename = '';
    let rawSourceData = '';
    let metadata = {};
    let sourceUrl = '';

    if (['pdf', 'image'].includes(sourceType)) {
      if (!req.file) {
        return res.status(400).json({ success: false, message: `Upload file is required for ${sourceType} import.` });
      }
      originalFilename = req.file.originalname;
      rawSourceData = req.file.path;
      metadata = { mimetype: req.file.mimetype, size: req.file.size };
    } else if (sourceType === 'url') {
      if (!url || !url.startsWith('http')) {
        return res.status(400).json({ success: false, message: 'A valid HTTP/HTTPS URL is required.' });
      }
      // Simple validation to prevent command injection or path traversal in URL parsing
      try {
        new URL(url);
      } catch (_) {
        return res.status(400).json({ success: false, message: 'Malformed URL.' });
      }
      originalFilename = url.split('/').pop() || 'website';
      rawSourceData = url;
      sourceUrl = url;
    } else if (['markdown', 'csv'].includes(sourceType)) {
      if (!text || text.trim() === '') {
        return res.status(400).json({ success: false, message: 'Text content is required.' });
      }
      originalFilename = `raw_${sourceType}_import.${sourceType === 'markdown' ? 'md' : 'csv'}`;
      rawSourceData = text;
    }

    const job = new ImportJob({
      uploadedBy: req.user?.id || req.user?._id || new mongoose.Types.ObjectId(),
      status: 'queued',
      sourceType,
      originalFilename,
      sourceUrl,
      rawSourceData,
      parserVersion: '1.0.0',
      progress: 0
    });
    await job.save();

    console.log(`[ImportController] Queued job ${job._id} for source type ${sourceType}`);

    // Trigger parser asynchronously in the background so request completes instantly
    setTimeout(() => {
      ImportParserService.processJob(job._id).catch(err => {
        console.error(`[ImportController] Background job ${job._id} processing failed:`, err);
      });
    }, 50);

    return res.status(202).json({
      success: true,
      message: 'Question import job has been queued successfully.',
      data: job
    });

  } catch (error) {
    console.error('[ImportController] createImport error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /imports
 * List import jobs
 */
exports.getJobs = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;

    const query = {};
    const total = await ImportJob.countDocuments(query);
    const jobs = await ImportJob.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.json({
      success: true,
      data: jobs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[ImportController] getJobs error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /imports/:id
 * Retrieve import job status by ID
 */
exports.getJobStatus = async (req, res) => {
  try {
    const jobId = req.params.id || req.params.jobId;
    if (!isValidObjectId(jobId)) {
      return res.status(400).json({ success: false, message: 'Invalid jobId.' });
    }

    const job = await ImportJob.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Import job not found.' });
    }

    return res.json({ success: true, data: job });
  } catch (error) {
    console.error('[ImportController] getJobStatus error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /imports/:id/items
 * Retrieve import job items
 */
exports.getJobItems = async (req, res) => {
  try {
    const jobId = req.params.id || req.params.jobId;
    if (!isValidObjectId(jobId)) {
      return res.status(400).json({ success: false, message: 'Invalid jobId.' });
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 1000; // high default for UI compatibility
    const skip = (page - 1) * limit;

    const query = { importJobId: jobId };
    const total = await ImportItem.countDocuments(query);
    const items = await ImportItem.find(query)
      .sort({ sourceIndex: 1 })
      .skip(skip)
      .limit(limit);

    return res.json({
      success: true,
      data: items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[ImportController] getJobItems error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PATCH /imports/item/:id
 * Update/edit import item
 */
exports.updateItem = async (req, res) => {
  try {
    const itemId = req.params.id || req.params.itemId;
    const { question, questionText, options, correctAnswer, className, classNo, chapterName, language, explanation, diagram } = req.body;

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

    // Apply raw updates first
    const qText = question || questionText;
    if (qText !== undefined) item.question = qText.trim();
    if (options !== undefined) {
      if (!Array.isArray(options) || options.length !== 4) {
        return res.status(400).json({ success: false, message: 'Exactly 4 options are required.' });
      }
      item.options = options.map(o => String(o || '').trim());
    }
    if (correctAnswer !== undefined) item.correctAnswer = correctAnswer.trim();
    if (className !== undefined) item.className = String(className).trim();
    else if (classNo !== undefined) item.className = String(classNo).trim();
    if (chapterName !== undefined) item.chapterName = chapterName.trim();
    if (language !== undefined) item.language = language;
    if (explanation !== undefined) item.explanation = explanation.trim();
    if (diagram !== undefined) item.diagram = diagram;

    // Run normalization pipeline
    const normalized = ImportNormalizerService.normalizeQuestion({
      question: item.question,
      options: item.options,
      correctAnswer: item.correctAnswer,
      explanation: item.explanation
    });

    item.question = normalized.question;
    item.options = normalized.options;
    item.correctAnswer = normalized.correctAnswer;
    item.explanation = normalized.explanation;

    // Resolve class/chapter
    const resolved = await resolveClassAndChapter(item.className || 12, item.chapterName || 'General');
    item.className = String(resolved.classNo);
    item.chapterName = resolved.chapterName;
    item.classId = resolved.classId;
    item.chapterId = resolved.chapterId;

    // Regenerate hashes
    item.questionHash = QuestionDuplicateDetector.hash(QuestionDuplicateDetector.normalize(item.question));
    item.contentHash = QuestionDuplicateDetector.contentHash({
      question: item.question,
      options: item.options,
      correctAnswer: item.correctAnswer
    });

    // Recheck duplicates
    const dupCheck = await QuestionDuplicateDetector.checkDuplicate(
      item.question,
      resolved.classNo,
      item.options,
      item.correctAnswer
    );
    item.duplicateFound = dupCheck.duplicateDetected;
    item.duplicateQuestionId = dupCheck.existingQuestion ? dupCheck.existingQuestion._id : null;

    // Clear warnings & errors and re-evaluate
    item.warnings = [];
    item.errors = [];

    if (dupCheck.duplicateDetected) {
      item.warnings.push(`Duplicate check warning: ${dupCheck.rating} (${(dupCheck.similarity * 100).toFixed(0)}% similarity)`);
    }

    if (!item.question) {
      item.errors.push('Question text is empty or failed to parse.');
    }
    if (!item.options || item.options.length !== 4) {
      item.errors.push('Exactly 4 options are required.');
    }

    await item.save();
    return res.json({ success: true, message: 'Item updated successfully.', data: item });

  } catch (error) {
    console.error('[ImportController] updateItem error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /imports/item/:id/approve
 * Approve individual item (inserts into Questions, marks saved)
 */
exports.approveItem = async (req, res) => {
  try {
    const itemId = req.params.id;
    if (!isValidObjectId(itemId)) {
      return res.status(400).json({ success: false, message: 'Invalid itemId.' });
    }

    const item = await ImportItem.findById(itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Import item not found.' });
    }

    if (item.status !== 'pending_verification') {
      return res.status(400).json({ success: false, message: `Item has already been processed. Status: ${item.status}` });
    }

    if (item.duplicateFound) {
      return res.status(400).json({
        success: false,
        message: 'Cannot save duplicate question without teacher intervention. Please edit or delete it first.'
      });
    }

    if (item.errors && item.errors.length > 0) {
      return res.status(400).json({ success: false, message: `Cannot approve item with validation errors: ${item.errors.join(', ')}` });
    }

    // Resolve class & chapter dynamically to be absolutely sure
    const resolved = await resolveClassAndChapter(item.className || 12, item.chapterName || 'General');

    // Create production Question
    const question = new Question({
      language: item.language,
      classId: resolved.classId,
      chapterId: resolved.chapterId,
      question: item.question,
      options: item.options,
      correctAnswer: item.correctAnswer,
      explanation: item.explanation,
      diagram: item.diagram,
      questionHash: item.questionHash,
      contentHash: item.contentHash
    });
    await question.save();

    item.status = 'saved';
    item.duplicateQuestionId = question._id;
    await item.save();

    // Update parent job counters
    const job = await ImportJob.findById(item.importJobId);
    if (job) {
      job.approvedItems += 1;
      const remainingPending = await ImportItem.countDocuments({ importJobId: job._id, status: 'pending_verification' });
      if (remainingPending === 0) {
        job.status = job.failedItems > 0 ? 'failed' : 'completed';
      } else {
        job.status = 'partially_saved';
      }
      await job.save();
    }

    // Log audit log
    await auditLogService.log({
      actorId: req.user?.id || req.user?._id || new mongoose.Types.ObjectId(),
      action: 'import_question_approve',
      targetType: 'Question',
      targetId: question._id,
      metadata: { jobId: item.importJobId, itemId: item._id }
    });

    return res.json({ success: true, message: 'Item approved and saved to question bank.', data: item });

  } catch (error) {
    console.error('[ImportController] approveItem error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /imports/item/:id/reject
 * Reject individual item (marks rejected)
 */
exports.rejectItem = async (req, res) => {
  try {
    const itemId = req.params.id;
    if (!isValidObjectId(itemId)) {
      return res.status(400).json({ success: false, message: 'Invalid itemId.' });
    }

    const item = await ImportItem.findById(itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Import item not found.' });
    }

    if (item.status !== 'pending_verification') {
      return res.status(400).json({ success: false, message: `Item has already been processed. Status: ${item.status}` });
    }

    item.status = 'rejected';
    await item.save();

    // Update parent job counters
    const job = await ImportJob.findById(item.importJobId);
    if (job) {
      job.rejectedItems += 1;
      const remainingPending = await ImportItem.countDocuments({ importJobId: job._id, status: 'pending_verification' });
      if (remainingPending === 0) {
        job.status = job.failedItems > 0 ? 'failed' : 'completed';
      } else {
        job.status = 'partially_saved';
      }
      await job.save();
    }

    return res.json({ success: true, message: 'Item rejected.', data: item });

  } catch (error) {
    console.error('[ImportController] rejectItem error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /imports/:id/save (or /import/jobs/:id/confirm)
 * Batch save approved items
 */
exports.confirmJobItems = async (req, res) => {
  try {
    const jobId = req.params.id || req.params.jobId;
    const { confirmItemIds, rejectItemIds } = req.body;

    if (!isValidObjectId(jobId)) {
      return res.status(400).json({ success: false, message: 'Invalid jobId.' });
    }

    const job = await ImportJob.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Import job not found.' });
    }

    let savedCount = 0;
    let failedCount = 0;
    let rejectedCount = 0;

    // 1. Process Rejections
    if (Array.isArray(rejectItemIds) && rejectItemIds.length > 0) {
      const result = await ImportItem.updateMany(
        { _id: { $in: rejectItemIds }, importJobId: jobId, status: 'pending_verification' },
        { $set: { status: 'rejected' } }
      );
      rejectedCount += result.modifiedCount;
      job.rejectedItems += result.modifiedCount;
    }

    // 2. Process Confirmations (Save to Questions collection)
    const queryConfirm = { importJobId: jobId, status: 'pending_verification' };
    if (Array.isArray(confirmItemIds) && confirmItemIds.length > 0) {
      queryConfirm._id = { $in: confirmItemIds };
    }

    const itemsToConfirm = await ImportItem.find(queryConfirm);

    for (const item of itemsToConfirm) {
      try {
        if (item.duplicateFound) {
          // Skip auto-saving duplicate questions to keep Questions database unique
          item.errors = item.errors || [];
          if (!item.errors.includes('Cannot auto-save duplicate questions.')) {
            item.errors.push('Cannot auto-save duplicate questions.');
          }
          await item.save();
          failedCount++;
          continue;
        }

        // Resolve class and chapter IDs dynamically
        const resolved = await resolveClassAndChapter(item.className || item.classNo || 12, item.chapterName || 'General');

        const question = new Question({
          language: item.language,
          classId: resolved.classId,
          chapterId: resolved.chapterId,
          question: item.question,
          options: item.options,
          correctAnswer: item.correctAnswer,
          explanation: item.explanation,
          diagram: item.diagram,
          questionHash: item.questionHash,
          contentHash: item.contentHash
        });

        await question.save();

        // Mark import item as saved
        item.status = 'saved';
        item.duplicateQuestionId = question._id;
        item.errors = [];
        await item.save();
        savedCount++;

        // Log audit details
        await auditLogService.log({
          actorId: req.user?.id || req.user?._id || new mongoose.Types.ObjectId(),
          action: 'import_question_confirm',
          targetType: 'Question',
          targetId: question._id,
          metadata: { jobId: job._id, itemId: item._id }
        });

      } catch (itemErr) {
        console.error(`[ImportController] Failed to confirm item ${item._id}:`, itemErr.message);
        item.errors = item.errors || [];
        item.errors.push(itemErr.message);
        await item.save();
        failedCount++;
      }
    }

    // Update parent job counters and status
    job.approvedItems += savedCount;
    job.failedItems += failedCount;
    
    const remainingPending = await ImportItem.countDocuments({ importJobId: jobId, status: 'pending_verification' });
    if (remainingPending === 0) {
      job.status = job.failedItems > 0 ? 'failed' : 'completed';
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

/**
 * DELETE /imports/:id
 * Delete import job and all associated items
 */
exports.deleteJob = async (req, res) => {
  try {
    const jobId = req.params.id;
    if (!isValidObjectId(jobId)) {
      return res.status(400).json({ success: false, message: 'Invalid jobId.' });
    }

    const job = await ImportJob.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Import job not found.' });
    }

    // Safely delete temp uploaded file if exists
    if (job.rawSourceData && fs.existsSync(job.rawSourceData)) {
      try {
        fs.unlinkSync(job.rawSourceData);
      } catch (err) {
        console.error(`[ImportController] Failed to delete file ${job.rawSourceData}:`, err.message);
      }
    }

    // Delete job items and job itself
    await ImportItem.deleteMany({ importJobId: jobId });
    await ImportJob.deleteOne({ _id: jobId });

    return res.json({ success: true, message: 'Import job and items deleted successfully.' });

  } catch (error) {
    console.error('[ImportController] deleteJob error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
