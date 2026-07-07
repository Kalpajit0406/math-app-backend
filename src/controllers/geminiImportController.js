'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const ImportJob = require('../models/importJobModel');
const ImportItem = require('../models/importItemModel');
const Question = require('../models/questionModel');
const { GeminiExtractionService } = require('../services/geminiExtractionService');
const { resolveClassAndChapter } = require('../services/importParserService');
const { QuestionDuplicateDetector } = require('../services/questionDuplicateDetector');
const auditLogService = require('../services/auditLogService');

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/**
 * POST /api/v1/admin/gemini/import
 * Create and queue a Gemini question import job
 */
const createImport = async (req, res) => {
  const uploadStartedAt = Date.now();
  console.log(`[GeminiImportController] Upload started at: ${new Date().toISOString()}`);

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Upload file is required.' });
    }

    const { classNo = '12', chapter = 'General', engine = 'gemini' } = req.body;
    let fileMime = req.file.mimetype;
    const originalFilename = req.file.originalname;
    const size = req.file.size;

    // Sanitize fileMime if it is generic application/octet-stream
    if (fileMime === 'application/octet-stream' || !fileMime) {
      const ext = path.extname(originalFilename).toLowerCase();
      if (ext === '.pdf') {
        fileMime = 'application/pdf';
      } else if (ext === '.png') {
        fileMime = 'image/png';
      } else if (ext === '.webp') {
        fileMime = 'image/webp';
      } else if (ext === '.gif') {
        fileMime = 'image/gif';
      } else {
        fileMime = 'image/jpeg'; // Default fallback for image scans
      }
    }

    console.log(`[GeminiImportController] Upload finished. File: ${originalFilename} (${size} bytes, ${fileMime}) in ${Date.now() - uploadStartedAt}ms`);

    // Resolve sourceType: pdf or image
    let sourceType = 'image';
    if (fileMime === 'application/pdf' || originalFilename.toLowerCase().endsWith('.pdf')) {
      sourceType = 'pdf';
    }

    const isOpenRouter = engine === 'openrouter';

    const job = new ImportJob({
      uploadedBy: req.user?.id || req.user?._id || new mongoose.Types.ObjectId(),
      status: 'queued',
      sourceType,
      originalFilename,
      rawSourceData: req.file.path, // Store absolute path to uploaded temp file
      parserVersion: isOpenRouter ? 'openrouter-v1.0' : 'gemini-v1.0',
      progress: 0
    });
    await job.save();

    console.log(`[GeminiImportController] Queued ${engine} job ${job._id} for source type ${sourceType}`);

    // Asynchronously process the import job in the background
    setImmediate(async () => {
      const processStartedAt = Date.now();
      try {
        job.status = 'parsing';
        job.startedAt = new Date();
        job.progress = 10;
        await job.save();

        console.log(`[GeminiImportController] ${engine} request started for job ${job._id}`);
        let extracted = [];
        if (isOpenRouter) {
          const { OpenRouterExtractionService } = require('../services/openRouterExtractionService');
          if (sourceType === 'pdf') {
            extracted = await OpenRouterExtractionService.extractFromPdfPath(job.rawSourceData, parseInt(classNo), chapter);
          } else {
            const buffer = fs.readFileSync(job.rawSourceData);
            extracted = await OpenRouterExtractionService.extractFromBuffer(buffer, fileMime, parseInt(classNo), chapter);
          }
        } else {
          if (sourceType === 'pdf') {
            extracted = await GeminiExtractionService.extractFromPdfPath(job.rawSourceData, parseInt(classNo), chapter);
          } else {
            const buffer = fs.readFileSync(job.rawSourceData);
            extracted = await GeminiExtractionService.extractFromBuffer(buffer, fileMime, parseInt(classNo), chapter);
          }
        }

        console.log(`[GeminiImportController] ${engine} request finished in ${Date.now() - processStartedAt}ms. Extracted ${extracted.length} items.`);
        job.progress = 50;
        if (extracted.backupKeyUsed === true) {
          job.backupKeyUsed = true;
        }
        await job.save();

        let savedCount = 0;
        let index = 0;

        for (const item of extracted) {
          const resolved = await resolveClassAndChapter(item.className || classNo, item.chapterName || chapter);

          // Warnings and errors arrays
          const warnings = item.validationErrors ? [...item.validationErrors] : [];
          const errors = [];

          if (item.duplicateFound) {
            warnings.push('Duplicate check warning: Strong duplicate detected.');
          }

          if (!item.isValid) {
            errors.push('Validation failed. Review required.');
          }

          const importItem = new ImportItem({
            importJobId: job._id,
            sourceIndex: index++,
            question: item.questionText,
            options: item.options,
            correctAnswer: item.correctAnswer || item.correctOption || '',
            language: item.language || 'English',
            className: String(resolved.classNo),
            chapterName: resolved.chapterName,
            classId: resolved.classId,
            chapterId: resolved.chapterId,
            diagram: item.diagramPresent ? 'referenced' : null,
            rawContent: JSON.stringify(item),
            normalizedContent: item.questionText,
            parserConfidence: item.confidence || 1.0,
            status: 'pending_verification',
            warnings,
            errors,
            questionHash: QuestionDuplicateDetector.hash(QuestionDuplicateDetector.normalize(item.questionText)),
            contentHash: QuestionDuplicateDetector.contentHash({
              question: item.questionText,
              options: item.options,
              correctAnswer: item.correctAnswer || item.correctOption || ''
            }),
            duplicateFound: item.duplicateFound,
            duplicateQuestionId: item.duplicateQuestionId
          });

          await importItem.save();
          savedCount++;

          job.progress = Math.round(50 + (savedCount / extracted.length) * 50);
          await job.save();
        }

        job.status = 'preview_ready';
        job.totalItems = savedCount;
        job.completedAt = new Date();
        await job.save();

        console.log(`[GeminiImportController] Preview generated. Job ${job._id} status is preview_ready.`);

        // Clean up temp file after successful parsing
        if (fs.existsSync(job.rawSourceData)) {
          fs.unlinkSync(job.rawSourceData);
        }
      } catch (err) {
        console.error(`[GeminiImportController] Background job ${job._id} processing failed:`, err.message);
        job.status = 'failed';
        job.errorMessage = err.message;
        job.completedAt = new Date();
        await job.save();

        // Clean up temp file on failure as well
        if (job.rawSourceData && fs.existsSync(job.rawSourceData)) {
          fs.unlinkSync(job.rawSourceData);
        }
      }
    });

    return res.status(202).json({
      success: true,
      message: 'Question import job has been queued successfully.',
      data: job
    });

  } catch (error) {
    console.error('[GeminiImportController] createImport error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/v1/admin/gemini/status/:id
 * Get Gemini import job status by ID
 */
const getJobStatus = async (req, res) => {
  try {
    const jobId = req.params.id;
    if (!isValidObjectId(jobId)) {
      return res.status(400).json({ success: false, message: 'Invalid jobId.' });
    }

    const job = await ImportJob.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Import job not found.' });
    }

    return res.json({
      success: true,
      data: job
    });
  } catch (error) {
    console.error('[GeminiImportController] getJobStatus error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/v1/admin/gemini/status/:id/items
 * Get Gemini import job items
 */
const getJobItems = async (req, res) => {
  try {
    const jobId = req.params.id;
    if (!isValidObjectId(jobId)) {
      return res.status(400).json({ success: false, message: 'Invalid jobId.' });
    }

    const items = await ImportItem.find({ importJobId: jobId }).sort({ sourceIndex: 1 });

    return res.json({
      success: true,
      data: items
    });
  } catch (error) {
    console.error('[GeminiImportController] getJobItems error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/v1/admin/gemini/confirm
 * Batch save approved Gemini questions to database
 */
const confirmImport = async (req, res) => {
  console.log(`[GeminiImportController] Teacher confirmed import request received.`);

  try {
    const { jobId, confirmItemIds, rejectItemIds } = req.body;

    if (!jobId || !isValidObjectId(jobId)) {
      return res.status(400).json({ success: false, message: 'Valid jobId is required.' });
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
          // Block duplicate save
          item.errors = item.errors || [];
          if (!item.errors.includes('Cannot auto-save duplicate questions.')) {
            item.errors.push('Cannot auto-save duplicate questions.');
          }
          await item.save();
          failedCount++;
          continue;
        }

        const resolved = await resolveClassAndChapter(item.className || item.classNo || 12, item.chapterName || 'General');

        const question = new Question({
          language: item.language,
          classId: resolved.classId,
          chapterId: resolved.chapterId,
          question: item.question,
          options: item.options,
          correctAnswer: item.correctAnswer,
          diagram: item.diagram,
          questionHash: item.questionHash,
          contentHash: item.contentHash
        });

        await question.save();

        item.status = 'saved';
        item.duplicateQuestionId = question._id;
        item.errors = [];
        await item.save();
        savedCount++;

        console.log(`[GeminiImportController] Database saved: Question ${question._id}`);

        // Log audit log details
        await auditLogService.log({
          actorId: req.user?.id || req.user?._id || new mongoose.Types.ObjectId(),
          action: 'gemini_import_question_confirm',
          targetType: 'Question',
          targetId: question._id,
          metadata: { jobId: job._id, itemId: item._id }
        });

      } catch (itemErr) {
        console.error(`[GeminiImportController] Failed to confirm item ${item._id}:`, itemErr.message);
        item.errors = item.errors || [];
        item.errors.push(itemErr.message);
        await item.save();
        failedCount++;
      }
    }

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
    console.error('[GeminiImportController] confirmImport error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createImport,
  getJobStatus,
  getJobItems,
  confirmImport
};
