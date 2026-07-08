const { OCRPipeline } = require('../services/ocrPipeline');
const { VerificationQueueManager } = require('../services/verificationQueueManager');
const Question = require('../models/questionModel');
const { uploadOnCloudinary } = require('../utils/cloudinary');
const { REDIS_URL } = require('../config/redis');

// Use async queue only if a real Redis URL is configured (not the default localhost fallback
// which is unavailable on Render/cloud without an add-on)
const HAS_REAL_REDIS = !!(
  process.env.REDIS_URL &&
  process.env.REDIS_URL.trim() &&
  !process.env.REDIS_URL.includes('127.0.0.1') &&
  !process.env.REDIS_URL.includes('localhost')
);

const OCR_SESSION_TIMEOUT_MS = Number.parseInt(process.env.OCR_SESSION_TIMEOUT_MS || '120000', 10);

const withTimeout = (promise, timeoutMs, timeoutMessage) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    }),
  ]);
};

/**
 * Resolves the image source for OCR processing.
 */
const resolveSource = (req) => {
  if (req.file) {
    return {
      type: 'buffer',
      buffer: req.file.buffer,
      mimetype: req.file.mimetype || 'image/jpeg',
      filename: req.file.originalname || 'image.jpg',
    };
  }
  if (req.body?.base64Image) {
    const src = req.body.base64Image.startsWith('data:image')
      ? req.body.base64Image
      : `data:image/jpeg;base64,${req.body.base64Image}`;
    return { type: 'src', src };
  }
  if (req.body?.imageUrl) {
    return { type: 'src', src: req.body.imageUrl };
  }
  return null;
};

/**
 * Run OCR pipeline and update session with results (used inline when no Redis worker available)
 */
async function processOCRAndUpdateSession(source, sessionId, userId, language = 'English', engine = 'Mathpix') {
  const startedAt = Date.now();
  console.log(`[ocrSessionController] processOCRAndUpdateSession: Starting OCR processing. Session: ${sessionId}, Language: ${language}, Engine: ${engine}`);
  const mongoose = require('mongoose');
  try {
    let safeQuestions = [];
    let pageType = 'UNKNOWN_PAGE';
    let sections = [];
    let totalRejected = 0;
    let manualReviewArtifacts = [];

    const isGeminiSelected = String(engine).toLowerCase() === 'gemini';
    const isGemmaSelected = String(engine).toLowerCase() === 'gemma';
    const isMathpixSelected = String(engine).toLowerCase() === 'mathpix';

    const useGeminiDirect = isGeminiSelected || (isMathpixSelected && String(language).toLowerCase() !== 'english');
    const useGemmaDirect = isGemmaSelected;

    if (useGeminiDirect || useGemmaDirect) {
      console.log(`[ocrSessionController] Using direct API extraction (Gemini=${useGeminiDirect}, Gemma=${useGemmaDirect})...`);
      let extractedQuestions = [];
      if (useGemmaDirect) {
        const { OpenRouterExtractionService } = require('../services/openRouterExtractionService');
        extractedQuestions = await OpenRouterExtractionService.extractFromBuffer(source.buffer, source.mimetype);
      } else {
        const { GeminiExtractionService } = require('../services/geminiExtractionService');
        extractedQuestions = await GeminiExtractionService.extractFromBuffer(source.buffer, source.mimetype);
      }
      
      safeQuestions = extractedQuestions.map((gQ, idx) => {
        const _id = new mongoose.Types.ObjectId();
        return {
          _id,
          questionText: gQ.questionText,
          options: gQ.options,
          questionNumber: gQ.questionNumber || String(idx + 1),
          detectionOrder: idx + 1,
          format: gQ.format || 'mcq',
          columnA: gQ.columnA || [],
          columnB: gQ.columnB || [],
          matchingChoices: gQ.matchingChoices || [],
          blanks: gQ.blanks || [],
          blankCount: gQ.blankCount || 0,
          confidenceScores: {
            ocrConfidence: gQ.confidence ?? 0.90,
            parserConfidence: gQ.confidence ?? 0.90,
            overallConfidence: gQ.confidence ?? 0.90,
            rating: (gQ.confidence || 0.90) > 0.8 ? 'high' : ((gQ.confidence || 0.90) > 0.5 ? 'medium' : 'low')
          },
          validationErrors: gQ.validationErrors || [],
          quarantineReasons: gQ.quarantineReasons || [],
          extractionState: gQ.isValid ? 'ACCEPTED' : 'MANUAL_REVIEW',
          duplicateInfo: {
            detected: gQ.duplicateFound || false,
            similarity: gQ.duplicateFound ? 1.0 : 0.0,
            rating: gQ.duplicateFound ? 'Block duplicate' : 'Allow normally',
            existingQuestionId: gQ.duplicateQuestionId || null,
            existingQuestionText: ''
          },
          rawOcrData: {
            rawChunk: gQ.questionText,
            ocrConfidence: gQ.confidence ?? 0.90,
            pageType: 'MCQ_PAGE',
            effectiveParserType: 'mcq',
            layoutMetadata: { strategy: 'text-only' }
          }
        };
      });
      pageType = 'MCQ_PAGE';
    } else {
      // English Mathpix (via OCRPipeline)
      console.log(`[ocrSessionController] Using Mathpix/OCRPipeline for English OCR...`);
      let ocrResult = null;
      let pipelineError = null;

      try {
        if (source.type === 'buffer') {
          ocrResult = await OCRPipeline.runFromBuffer(source.buffer, source.mimetype, source.filename);
        } else {
          throw new Error('Unsupported source type for inline processing: ' + source.type);
        }
      } catch (err) {
        pipelineError = err;
        console.error(`[ocrSessionController] English OCRPipeline error: ${err.message}`);
      }

      const allItems = ocrResult?.parsedQuestions || [];
      const unfilteredSafeQuestions = allItems.filter(q => q.type !== 'MANUAL_REVIEW_ARTIFACT');

      if (pipelineError || unfilteredSafeQuestions.length === 0) {
        console.warn(`[ocrSessionController] Mathpix/OCRPipeline failed or returned 0 questions. Falling back to Gemini...`);
        const { GeminiExtractionService } = require('../services/geminiExtractionService');
        const geminiQuestions = await GeminiExtractionService.extractFromBuffer(source.buffer, source.mimetype);
        
        safeQuestions = geminiQuestions.map((gQ, idx) => {
          const _id = new mongoose.Types.ObjectId();
          return {
            _id,
            questionText: gQ.questionText,
            options: gQ.options,
            questionNumber: gQ.questionNumber || String(idx + 1),
            detectionOrder: idx + 1,
            format: gQ.format || 'mcq',
            columnA: gQ.columnA || [],
            columnB: gQ.columnB || [],
            matchingChoices: gQ.matchingChoices || [],
            blanks: gQ.blanks || [],
            blankCount: gQ.blankCount || 0,
            confidenceScores: {
              ocrConfidence: gQ.confidence ?? 0.90,
              parserConfidence: gQ.confidence ?? 0.90,
              overallConfidence: gQ.confidence ?? 0.90,
              rating: (gQ.confidence || 0.90) > 0.8 ? 'high' : ((gQ.confidence || 0.90) > 0.5 ? 'medium' : 'low')
            },
            validationErrors: gQ.validationErrors || [],
            quarantineReasons: gQ.quarantineReasons || [],
            extractionState: gQ.isValid ? 'ACCEPTED' : 'MANUAL_REVIEW',
            duplicateInfo: {
              detected: gQ.duplicateFound || false,
              similarity: gQ.duplicateFound ? 1.0 : 0.0,
              rating: gQ.duplicateFound ? 'Block duplicate' : 'Allow normally',
              existingQuestionId: gQ.duplicateQuestionId || null,
              existingQuestionText: ''
            },
            rawOcrData: {
              rawChunk: gQ.questionText,
              ocrConfidence: gQ.confidence ?? 0.90,
              pageType: 'MCQ_PAGE',
              effectiveParserType: 'mcq',
              layoutMetadata: { strategy: 'text-only' }
            }
          };
        });
        pageType = 'MCQ_PAGE';
      } else {
        // Success with Mathpix
        safeQuestions = unfilteredSafeQuestions;
        pageType = ocrResult.pageType || 'UNKNOWN_PAGE';
        sections = ocrResult.sections || [];
        totalRejected = ocrResult.totalRejected || 0;
        manualReviewArtifacts = ocrResult.manualReviewArtifacts || [];
      }
    }

    const processingTimeMs = Date.now() - startedAt;

    await VerificationQueueManager.updateSession(sessionId, {
      items: safeQuestions,
      status: 'completed',
      progress: 100,
      pipelineMetadata: {
        pageType,
        sectionsFound: sections.length,
        totalExtracted: safeQuestions.length,
        totalRejected,
        manualReviewCount: manualReviewArtifacts.length,
        sourceUsed: source.type,
        processingTimeMs,
        manualReviewSummaries: manualReviewArtifacts.map(a => ({
          failureReason: a.failureReason,
          pageType:      a.pageType,
          textLength:    a.textLength,
          ocrConfidence: a.ocrConfidence,
        })),
      },
    });

    console.log(`[ocrSessionController] Inline OCR done for session ${sessionId}: ${safeQuestions.length} questions, ${manualReviewArtifacts.length} manual-review in ${processingTimeMs}ms`);
  } catch (err) {
    console.error(`[ocrSessionController] Inline OCR failed for session ${sessionId}:`, err.message);
    await VerificationQueueManager.updateSession(sessionId, {
      status: 'failed',
      progress: 0,
    }).catch(() => {});
  }
}

/**
 * Start Verification Session (Asynchronous Flow)
 * POST /api/v1/admin/ocr/session/start
 */
const startSession = async (req, res) => {
  const requestStartedAt = Date.now();
  try {
    console.log(`[ocrSessionController] startSession: upload received (mode=${HAS_REAL_REDIS ? 'async-queue' : 'inline'})`);

    const source = resolveSource(req);
    if (!source) {
      return res.status(400).json({
        success: false,
        message: 'Provide an image file (multipart), base64Image, or imageUrl',
      });
    }

    if (source.type === 'buffer' && (!source.buffer || source.buffer.length === 0)) {
      console.error('[ocrSessionController] Received empty buffer in controller');
      return res.status(400).json({
        success: false,
        message: 'Empty file buffer received.',
      });
    }

    const { language = 'English', engine = 'Mathpix' } = req.body;
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication credentials not found'
      });
    }

    // Pre-create VerificationSession in MongoDB with pending status
    const session = await VerificationQueueManager.createSession(
      sessionId,
      userId,
      [], // No items yet
      86400, // 24 hours TTL
      null,
      {
        pageType: 'UNKNOWN_PAGE',
        sectionsFound: 0,
        totalExtracted: 0,
        totalRejected: 0,
        sourceUsed: source.type,
        processingTimeMs: 0
      },
      'pending',
      0
    );

    if (HAS_REAL_REDIS) {
      // ── ASYNC MODE: enqueue to Redis worker (requires separate worker process) ──
      const OCRJob = require('../models/ocrJobModel');
      const job = new OCRJob({
        status: 'pending',
        sourceType: source.type,
        filename: source.filename || 'image.jpg',
        mimetype: source.mimetype || 'image/jpeg',
        buffer: source.type === 'buffer' ? source.buffer : Buffer.from(source.src || '', 'utf8'),
        availableAt: new Date(),
      });
      await job.save();

      const DistributedQueue = require('../utils/redisQueue');
      const preprocessingQueue = new DistributedQueue('preprocessing');
      await preprocessingQueue.addJob(job._id.toString(), {
        jobId: job._id.toString(),
        sessionId: session.sessionId,
        sourceType: source.type,
        mimetype: source.mimetype,
        filename: source.filename,
        language,
        engine
      });

      console.log(`[ocrSessionController] Job enqueued: jobId=${job._id}, sessionId=${session.sessionId}`);

      return res.status(202).json({
        success: true,
        data: {
          sessionId: session.sessionId,
          currentIndex: 0,
          total: 0,
          items: [],
          status: 'pending',
          progress: 0,
          expiresAt: session.expiresAt
        }
      });
    } else {
      // ── INLINE MODE: process directly, no separate worker needed ──
      // Run OCR in background (non-blocking), respond immediately with pending
      // The Flutter app polls GET /session/:id until status=completed
      setImmediate(() => processOCRAndUpdateSession(source, session.sessionId, userId, language, engine));

      console.log(`[ocrSessionController] Inline OCR started for session ${session.sessionId}`);

      return res.status(202).json({
        success: true,
        data: {
          sessionId: session.sessionId,
          currentIndex: 0,
          total: 0,
          items: [],
          status: 'pending',
          progress: 0,
          expiresAt: session.expiresAt
        }
      });
    }
  } catch (error) {
    console.error('[ocrSessionController] startSession error:', error);
    res.status(500).json({ success: false, message: error.message || 'OCR session startup failed' });
  }
};

/**
 * Get Verification Session
 * GET /api/v1/admin/ocr/session/:sessionId
 */
const getSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await VerificationQueueManager.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ success: false, message: 'Verification session not found' });
    }

    res.json({
      success: true,
      data: {
        sessionId: session.sessionId,
        currentIndex: VerificationQueueManager.getFilteredIndex(session, session.currentIndex),
        total: session.items.filter(i => !i.isDeleted).length,
        items: session.items.filter(i => !i.isDeleted),
        expiresAt: session.expiresAt,
        status: session.status || 'completed',
        progress: session.progress || 100
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update Session Item
 * PUT /api/v1/admin/ocr/session/:sessionId/item/:index
 */
const updateItem = async (req, res) => {
  try {
    const { sessionId, index } = req.params;
    const { questionText, options, questionNumber, verified } = req.body;

    const session = await VerificationQueueManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Verification session not found' });
    }

    const idx = VerificationQueueManager.getRawIndex(session, parseInt(index));
    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Item index not found' });
    }

    const updated = await VerificationQueueManager.updateQuestion(sessionId, idx, {
      questionText,
      options,
      questionNumber,
      verified
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Remove Session Item
 * DELETE /api/v1/admin/ocr/session/:sessionId/item/:index
 */
const deleteItem = async (req, res) => {
  try {
    const { sessionId, index } = req.params;
    const session = await VerificationQueueManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Verification session not found' });
    }

    const idx = VerificationQueueManager.getRawIndex(session, parseInt(index));
    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Item index not found' });
    }

    const success = await VerificationQueueManager.removeQuestion(sessionId, idx);
    res.json({ success: true, message: 'Question item removed from verification queue' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Verify Item & Push to Main DB
 * POST /api/v1/admin/ocr/session/:sessionId/item/:index/verify
 */
const verifyItem = async (req, res) => {
  const mongoose = require('mongoose');
  const dbSession = await mongoose.startSession();
  let transactionStarted = false;
  try {
    const { sessionId, index } = req.params;
    const { chapter, classNo, correctAnswer, language, questionText, options, action, replaceQuestionId } = req.body;

    if (!chapter || !classNo || !correctAnswer || !language) {
      return res.status(400).json({
        success: false,
        message: 'Missing metadata for Question database insertion (chapter, classNo, correctAnswer, language are required)'
      });
    }

    try {
      await dbSession.startTransaction();
      transactionStarted = true;
    } catch (err) {
      // Replica sets not enabled
    }

    const session = await VerificationQueueManager.getSession(sessionId, transactionStarted ? dbSession : null);
    if (!session) {
      if (transactionStarted) await dbSession.abortTransaction();
      return res.status(404).json({ success: false, message: 'Verification session not found' });
    }

    const idx = VerificationQueueManager.getRawIndex(session, parseInt(index));
    if (idx === -1) {
      if (transactionStarted) await dbSession.abortTransaction();
      return res.status(404).json({ success: false, message: 'Item index not found' });
    }

    const item = session.items[idx];

    // Read question content either from body overrides or from session item
    const finalQuestion = (questionText !== undefined) ? questionText : item.questionText;
    
    let finalOptions = options;
    if (typeof options === "string") {
      try {
        finalOptions = JSON.parse(options);
      } catch (e) {
        if (transactionStarted) await dbSession.abortTransaction();
        return res.status(400).json({ success: false, message: "Invalid options format" });
      }
    }
    if (!finalOptions) {
      finalOptions = item.options;
    }

    // Handle diagram upload if present
    let diagramUrl = null;
    if (req.file) {
      const uploadResult = await uploadOnCloudinary(req.file.path);
      if (uploadResult?.secure_url) {
        diagramUrl = uploadResult.secure_url;
      } else {
        const path = require('path');
        const filename = path.basename(req.file.path);
        diagramUrl = `/public/temp/${filename}`;
      }
    }

    // If no custom diagram was uploaded, fall back to the session's scannedImageUrl
    if (!diagramUrl && session.scannedImageUrl) {
      diagramUrl = session.scannedImageUrl;
    }

    // Build or update the Question
    let finalQuestionObj;
    let isReplacement = false;
    const opts = transactionStarted ? { session: dbSession } : {};

    if (action === 'replace' && replaceQuestionId) {
      const { normalizeQuestion, generateHash, generateContentHash } = require('../services/questionDuplicateDetector');
      const hash = generateHash(normalizeQuestion(finalQuestion));
      const cHash = generateContentHash({
        question: finalQuestion,
        options: finalOptions,
        correctAnswer,
        type: (finalOptions && finalOptions.length > 0) ? 'mcq' : 'numeric'
      });

      const { getClassIdFromNo } = require('../utils/classCache');
      const classId = getClassIdFromNo(classNo);

      let chapterId;
      if (classId && chapter) {
        const Chapter = require('../models/chapterModel');
        const { normalizeChapterName } = require('../utils/chapterNormalization');
        const normalized = normalizeChapterName(chapter);
        let chap = await Chapter.findOne({ classId, normalizedChapterName: normalized });
        if (!chap) {
          const newChaps = await Chapter.create([{
            classId,
            chapterName: chapter,
          }], opts);
          chap = newChaps[0];
        }
        chapterId = chap._id;
      }

      finalQuestionObj = await Question.findByIdAndUpdate(replaceQuestionId, {
        language,
        chapterId,
        classId,
        correctAnswer,
        options: finalOptions,
        question: finalQuestion,
        diagram: diagramUrl,
        questionHash: hash,
        contentHash: cHash
      }, { ...opts, returnDocument: 'after' });

      if (!finalQuestionObj) {
        if (transactionStarted) await dbSession.abortTransaction();
        return res.status(404).json({ success: false, message: 'Question to replace not found' });
      }
      isReplacement = true;
    } else {
      const newQuestions = await Question.create([{
        language,
        chapter,
        classNo: parseInt(classNo),
        correctAnswer,
        options: finalOptions,
        question: finalQuestion,
        diagram: diagramUrl
      }], opts);
      finalQuestionObj = newQuestions[0];
    }

    // Mark as verified in the session
    await VerificationQueueManager.updateQuestion(sessionId, idx, {
      questionText: finalQuestion,
      options: finalOptions,
      verified: true
    }, transactionStarted ? dbSession : null);

    // Audit the action
    const auditLogService = require('../services/auditLogService');
    await auditLogService.log({
      actorId: req.user?.id,
      action: isReplacement ? 'ocr_override_approval' : 'ocr_verification_finalize',
      targetType: 'Question',
      targetId: finalQuestionObj._id,
      metadata: {
        sessionId,
        classNo: parseInt(classNo),
        chapter,
        isReplacement
      },
      req
    }, transactionStarted ? dbSession : null);

    if (transactionStarted) {
      await dbSession.commitTransaction();
    }

    res.status(201).json({
      success: true,
      message: isReplacement ? 'Question verified and replaced successfully' : 'Question verified and created successfully',
      data: finalQuestionObj
    });
  } catch (error) {
    if (transactionStarted && dbSession.inTransaction()) {
      await dbSession.abortTransaction();
    }
    console.error('[ocrSessionController] verifyItem error:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    dbSession.endSession();
  }
};

/**
 * Move current index pointer forward
 * POST /api/v1/admin/ocr/session/:sessionId/next
 */
const nextItem = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const nextItem = await VerificationQueueManager.nextQuestion(sessionId);
    const status = await VerificationQueueManager.getStatus(sessionId);

    res.json({
      success: true,
      data: {
        currentIndex: status?.currentIndex,
        hasNext: status?.hasNext,
        hasPrev: status?.hasPrev,
        item: nextItem
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Move current index pointer backward
 * POST /api/v1/admin/ocr/session/:sessionId/prev
 */
const prevItem = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const prevItem = await VerificationQueueManager.prevQuestion(sessionId);
    const status = await VerificationQueueManager.getStatus(sessionId);

    res.json({
      success: true,
      data: {
        currentIndex: status?.currentIndex,
        hasNext: status?.hasNext,
        hasPrev: status?.hasPrev,
        item: prevItem
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const setCurrentIndex = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { index } = req.body;
    const filteredIndex = parseInt(index);

    const session = await VerificationQueueManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Verification session not found' });
    }

    const idx = VerificationQueueManager.getRawIndex(session, filteredIndex);
    if (idx !== -1) {
      session.currentIndex = idx;
      await session.save();
    }

    res.json({ success: true, currentIndex: filteredIndex });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getArchivedOcr = async (req, res) => {
  try {
    const { sessionId, itemId } = req.params;
    const OcrArchive = require('../models/ocrArchiveModel');
    const archive = await OcrArchive.findOne({ sessionId, itemId });
    if (!archive) {
      return res.status(404).json({ success: false, message: 'Archived OCR data not found' });
    }
    res.json({
      success: true,
      data: archive.rawOcrData
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  startSession,
  getSession,
  updateItem,
  deleteItem,
  verifyItem,
  nextItem,
  prevItem,
  setCurrentIndex,
  getArchivedOcr
};
