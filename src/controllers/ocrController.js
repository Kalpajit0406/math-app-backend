const { OCRPipeline } = require('../services/ocrPipeline');
const { OCRQueueService } = require('../services/ocrQueueService');

const OCR_SCAN_TIMEOUT_MS = Number.parseInt(process.env.OCR_SCAN_TIMEOUT_MS || '30000', 10);

const withTimeout = (promise, timeoutMs, timeoutMessage) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
};

/**
 * Resolves the image source for OCR.
 * Priority: 1) Multer file buffer (most reliable), 2) base64 body, 3) URL body
 */
const resolveSource = (req) => {
  if (req.file) {
    console.log('[OCR] Using multer file path:', req.file.path, `${(req.file.size / 1024).toFixed(1)}KB`);
    return {
      type: 'file',
      path: req.file.path,
      mimetype: req.file.mimetype || 'image/jpeg',
      filename: req.file.originalname || 'image.jpg',
    };
  }
  if (req.body?.base64Image) {
    console.log('[OCR] Using base64 body string');
    const src = req.body.base64Image.startsWith('data:image')
      ? req.body.base64Image
      : `data:image/jpeg;base64,${req.body.base64Image}`;
    return { type: 'src', src, mimetype: 'image/jpeg', filename: 'base64_upload.jpg' };
  }
  if (req.body?.imageUrl) {
    console.log('[OCR] Using image URL:', req.body.imageUrl);
    const filename = req.body.imageUrl.split('/').pop() || 'url_upload.jpg';
    return { type: 'src', src: req.body.imageUrl, mimetype: 'image/jpeg', filename };
  }
  return null;
};

exports.scanImage = async (req, res) => {
  const requestStartedAt = Date.now();
  let source = null;
  try {
    console.log('[OCR] Upload start (async queue flow)');
    source = resolveSource(req);
    if (!source) {
      return res.status(400).json({
        success: false,
        message: 'Provide an image file (multipart), base64Image, or imageUrl',
      });
    }

    const fs = require('fs');
    const path = require('path');
    let diskPath = null;

    if (source.type === 'file') {
      diskPath = source.path;
    } else if (source.type === 'src') {
      diskPath = path.join(__dirname, `../../public/temp/ocr-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`);
      if (source.src.startsWith('data:image')) {
        const base64Data = source.src.replace(/^data:image\/\w+;base64,/, "");
        fs.writeFileSync(diskPath, Buffer.from(base64Data, 'base64'));
      } else {
        const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
        const response = await fetch(source.src);
        const fileStream = fs.createWriteStream(diskPath);
        await new Promise((resolve, reject) => {
          response.body.pipe(fileStream);
          response.body.on('error', reject);
          fileStream.on('finish', resolve);
        });
      }
    }

    if (!diskPath || !fs.existsSync(diskPath)) {
      return res.status(400).json({
        success: false,
        message: 'Failed to save or locate image file on disk.',
      });
    }

    // Create a new OCRJob in MongoDB (No buffer stored!)
    const OCRJob = require('../models/ocrJobModel');
    const job = new OCRJob({
      status: 'pending',
      sourceType: source.type === 'file' ? 'file' : (source.src?.startsWith('http') ? 'url' : 'base64'),
      filename: source.filename || 'image.jpg',
      mimetype: source.mimetype || 'image/jpeg',
      filePath: diskPath,
      availableAt: new Date(),
    });
    await job.save();

    // Enqueue the job to the Redis preprocessing queue
    const DistributedQueue = require('../utils/redisQueue');
    const preprocessingQueue = new DistributedQueue('preprocessing');
    await preprocessingQueue.addJob(job._id.toString(), {
      jobId: job._id.toString(),
      sourceType: 'file',
      mimetype: source.mimetype,
      filename: source.filename,
      filePath: diskPath
    });

    console.log(`[OCR] Job enqueued: jobId=${job._id}, filePath=${diskPath}`);

    return res.status(202).json({
      success: true,
      jobId: job._id,
      message: 'OCR job queued'
    });
  } catch (error) {
    console.error('[OCR] Controller error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to queue OCR job'
    });
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
