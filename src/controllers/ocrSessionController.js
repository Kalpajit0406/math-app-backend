const { OCRPipeline } = require('../services/ocrPipeline');
const { VerificationQueueManager } = require('../services/verificationQueueManager');
const Question = require('../models/questionModel');
const { uploadOnCloudinary } = require('../utils/cloudinary');

const OCR_SESSION_TIMEOUT_MS = Number.parseInt(process.env.OCR_SESSION_TIMEOUT_MS || '30000', 10);

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
 * Start Verification Session (Asynchronous Flow)
 * POST /api/v1/admin/ocr/session/start
 */
const startSession = async (req, res) => {
  const requestStartedAt = Date.now();
  try {
    console.log('[ocrSessionController] startSession: upload received (async flow)');

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
      null, // scannedImageUrl will be attached by the worker
      {
        pageType: 'UNKNOWN_PAGE',
        sectionsFound: 0,
        totalExtracted: 0,
        totalRejected: 0,
        sourceUsed: source.type,
        processingTimeMs: 0
      },
      'pending', // status
      0 // progress
    );

    // Create tracking OCRJob in MongoDB
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

    // Enqueue job to Redis preprocessing queue
    const DistributedQueue = require('../utils/redisQueue');
    const preprocessingQueue = new DistributedQueue('preprocessing');
    await preprocessingQueue.addJob(job._id.toString(), {
      jobId: job._id.toString(),
      sessionId: session.sessionId,
      sourceType: source.type,
      mimetype: source.mimetype,
      filename: source.filename
    });

    console.log(`[ocrSessionController] startSession: job enqueued with jobId=${job._id}, sessionId=${session.sessionId}`);

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
  try {
    const { sessionId, index } = req.params;
    const { chapter, classNo, correctAnswer, language, questionText, options, action, replaceQuestionId } = req.body;

    if (!chapter || !classNo || !correctAnswer || !language) {
      return res.status(400).json({
        success: false,
        message: 'Missing metadata for Question database insertion (chapter, classNo, correctAnswer, language are required)'
      });
    }

    const session = await VerificationQueueManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Verification session not found' });
    }

    const idx = VerificationQueueManager.getRawIndex(session, parseInt(index));
    if (idx === -1) {
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
    if (action === 'replace' && replaceQuestionId) {
      const { normalizeQuestion, generateHash } = require('../services/questionDuplicateDetector');
      const hash = generateHash(normalizeQuestion(finalQuestion));

      finalQuestionObj = await Question.findByIdAndUpdate(replaceQuestionId, {
        language,
        chapter,
        classNo: parseInt(classNo),
        correctAnswer,
        options: finalOptions,
        question: finalQuestion,
        diagram: diagramUrl,
        questionHash: hash
      }, { new: true });

      if (!finalQuestionObj) {
        return res.status(404).json({ success: false, message: 'Question to replace not found' });
      }
      isReplacement = true;
    } else {
      finalQuestionObj = await Question.create({
        language,
        chapter,
        classNo: parseInt(classNo),
        correctAnswer,
        options: finalOptions,
        question: finalQuestion,
        diagram: diagramUrl
      });
    }

    // Mark as verified in the session
    await VerificationQueueManager.updateQuestion(sessionId, idx, {
      questionText: finalQuestion,
      options: finalOptions,
      verified: true
    });

    res.status(201).json({
      success: true,
      message: isReplacement ? 'Question verified and replaced successfully' : 'Question verified and created successfully',
      data: finalQuestionObj
    });
  } catch (error) {
    console.error('[ocrSessionController] verifyItem error:', error);
    res.status(500).json({ success: false, message: error.message });
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

module.exports = {
  startSession,
  getSession,
  updateItem,
  deleteItem,
  verifyItem,
  nextItem,
  prevItem,
  setCurrentIndex
};
