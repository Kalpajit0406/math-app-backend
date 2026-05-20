const { OCRPipeline } = require('../services/ocrPipeline');
const { OCRQueueService } = require('../services/ocrQueueService');

/**
 * Resolves the image source for OCR.
 * Priority: 1) Multer file buffer (most reliable), 2) base64 body, 3) URL body
 */
const resolveSource = (req) => {
  if (req.file) {
    console.log('[OCR] Using multer file buffer:', req.file.originalname, `${(req.file.size / 1024).toFixed(1)}KB`);
    return {
      type: 'buffer',
      buffer: req.file.buffer,
      mimetype: req.file.mimetype || 'image/jpeg',
      filename: req.file.originalname || 'image.jpg',
    };
  }
  if (req.body?.base64Image) {
    console.log('[OCR] Using base64 body string');
    const src = req.body.base64Image.startsWith('data:image')
      ? req.body.base64Image
      : `data:image/jpeg;base64,${req.body.base64Image}`;
    return { type: 'src', src };
  }
  if (req.body?.imageUrl) {
    console.log('[OCR] Using image URL:', req.body.imageUrl);
    return { type: 'src', src: req.body.imageUrl };
  }
  return null;
};

exports.scanImage = async (req, res) => {
  try {
    const source = resolveSource(req);
    if (!source) {
      return res.status(400).json({
        success: false,
        message: 'Provide an image file (multipart), base64Image, or imageUrl',
      });
    }

    if (source.type === 'buffer' && (!source.buffer || source.buffer.length === 0)) {
      console.error('[OCR] Received empty buffer in controller');
      return res.status(400).json({
        success: false,
        message: 'Empty image buffer received by server.',
      });
    }

    // Support async enqueue: client may supply ?async=true or body.async = true
    const wantsAsync = (req.query?.async === 'true') || (req.body?.async === true);
    if (wantsAsync && source.type === 'buffer') {
      // Enqueue and return job id for polling
      const job = await OCRQueueService.enqueueFromBuffer({ buffer: source.buffer, mimetype: source.mimetype, filename: source.filename, sourceType: 'file' });
      return res.status(202).json({ success: true, jobId: job._id, message: 'OCR job queued' });
    }

    let result;
    if (source.type === 'buffer') {
      // ✅ Primary path: direct buffer → FormData multipart upload to Mathpix
      result = await OCRPipeline.runFromBuffer(source.buffer, source.mimetype, source.filename);
    } else {
      // Fallback path: base64/URL (legacy compatibility)
      result = await OCRPipeline.run(source.src);
    }

    console.log(`[OCR] Success. Detected ${result.parsedQuestions?.length || 0} questions.`);

    return res.json({
      success: true,
      data: {
        rawText: result.rawText,
        latex: result.latex,
        parsedQuestions: result.parsedQuestions, // Updated to match pipeline
        parsedMcq: result.parsedQuestions, // Keep for backward compatibility
        confidence: result.confidence,
        qualityRating: result.qualityRating,
        sourceType: source.type === 'buffer' ? 'file' : (source.src?.startsWith('http') ? 'url' : 'base64'),
      },
    });
  } catch (error) {
    console.error('[OCR] Controller error:', error.message);
    const message = error.message || 'Failed to process image';

    // Return appropriate status code based on error type
    let statusCode = 502; // Default: bad gateway (upstream Mathpix failure)
    if (message.toLowerCase().includes('credentials')) statusCode = 500;
    else if (message.toLowerCase().includes('empty') || message.toLowerCase().includes('no file')) statusCode = 400;
    else if (message.toLowerCase().includes('too large')) statusCode = 413;

    return res.status(statusCode).json({ success: false, message });
  }
};

exports.getJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await OCRQueueService.getJob(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'OCR job not found' });
    }

    return res.json({
      success: true,
      data: {
        jobId: job._id,
        status: job.status,
        attempts: job.attempts,
        availableAt: job.availableAt || null,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        error: job.error || null,
        result: job.status === 'done' ? job.result : null,
      },
    });
  } catch (error) {
    console.error('[OCR] getJobStatus error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to get OCR job status' });
  }
};
