require('dotenv').config();
const connectDB = require('../config/db');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { ImagePreprocessor } = require('../services/imagePreprocessor');
const { OCRProviderAdapter } = require('../services/ocrProviderAdapter');
const { OCRPipeline } = require('../services/ocrPipeline');
const { VerificationQueueManager } = require('../services/verificationQueueManager');
const { uploadOnCloudinary } = require('../utils/cloudinary');
const OCRJob = require('../models/ocrJobModel');
const Attempt = require('../models/attemptModel');
const VerificationSession = require('../models/verificationSessionModel');
const DistributedQueue = require('../utils/redisQueue');

const preprocessingQueue = new DistributedQueue('preprocessing');
const ocrQueue = new DistributedQueue('ocr');
const parserQueue = new DistributedQueue('parser');
const validationQueue = new DistributedQueue('validation');

const POLL_INTERVAL_MS = 1000;

/**
 * Checks if there are active exams in the database
 */
async function hasActiveExams() {
  try {
    const count = await Attempt.countDocuments({ endTime: { $exists: false } });
    return count > 0;
  } catch (e) {
    return false;
  }
}

/**
 * Memory monitoring and GC trigger to fit under 512 MB RAM
 */
function monitorMemory() {
  const memory = process.memoryUsage();
  const heapUsedMB = Math.round(memory.heapUsed / 1024 / 1024);
  if (heapUsedMB > 150) {
    console.warn(`[Worker] ⚠️ High memory usage alert: ${heapUsedMB}MB heap used.`);
    if (global.gc) {
      console.log('[Worker] Invoking manual garbage collection...');
      global.gc();
    }
  }
}

/**
 * Cleans up stale files in temp folder older than 2 hours
 */
function cleanTempFiles() {
  const tempDir = path.join(__dirname, '../../public/temp');
  if (!fs.existsSync(tempDir)) return;
  fs.readdir(tempDir, (err, files) => {
    if (err) return;
    const now = Date.now();
    const maxAge = 2 * 60 * 60 * 1000; // 2 hours
    files.forEach(file => {
      const filePath = path.join(tempDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        if (now - stats.mtimeMs > maxAge) {
          fs.unlink(filePath, () => {
            console.log(`[Worker] Auto-cleaned stale temp file: ${file}`);
          });
        }
      });
    });
  });
}

// Start stale files cleaner periodically (every 30 minutes)
setInterval(cleanTempFiles, 30 * 60 * 1000);

async function runWorker() {
  await connectDB();
  console.log('✓ Workers initialized and connected to database (512MB RAM mode)');

  // Run initial stale task recovery
  try {
    await preprocessingQueue.recoverCrashedWorkers();
    await ocrQueue.recoverCrashedWorkers();
    await parserQueue.recoverCrashedWorkers();
    await validationQueue.recoverCrashedWorkers();
  } catch (_) {}

  // Periodically recover crashed worker locks (every 60 seconds)
  setInterval(async () => {
    try {
      await preprocessingQueue.recoverCrashedWorkers();
      await ocrQueue.recoverCrashedWorkers();
      await parserQueue.recoverCrashedWorkers();
      await validationQueue.recoverCrashedWorkers();
    } catch (_) {}
  }, 60000);

  // Start processing loops
  startPreprocessingWorker();
  startOcrWorker();
  startParserWorker();
  startValidationWorker();
}

/**
 * Helper to run pdftoppm to extract a page as a JPEG
 */
function extractPdfPage(pdfPath, pageNum, outputPath) {
  return new Promise((resolve, reject) => {
    const cmd = `pdftoppm -jpeg -f ${pageNum} -l ${pageNum} -r 150 -singlefile "${pdfPath}" "${outputPath}"`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`pdftoppm failed: ${error.message} (stderr: ${stderr})`));
      }
      resolve();
    });
  });
}

/**
 * 1. PREPROCESSING WORKER (File-to-File Processing)
 */
async function startPreprocessingWorker() {
  console.log('[Worker] Preprocessing loop started');
  while (true) {
    let job = null;
    try {
      monitorMemory();
      
      // Throttle if there are active student exams
      const activeExams = await hasActiveExams();
      if (activeExams) {
        console.log('[Worker:Preprocessing] Active student exams detected. Throttling loops (sleeping 8s)...');
        await new Promise(r => setTimeout(r, 8000));
      }

      job = await preprocessingQueue.popJob('preprocessing-worker');
      if (!job) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        continue;
      }

      const { jobId, parentJobId, sessionId, pdfPath, pageNum, totalPages } = job.data;
      console.log(`[Preprocessing] Processing job ${jobId} (Page ${pageNum || 'single'})`);

      const mongoJob = await OCRJob.findById(jobId);
      if (!mongoJob) {
        throw new Error(`Job ${jobId} not found in database`);
      }

      const finalPageJpgPath = path.join(__dirname, `../../public/temp/preprocessed-${jobId}.jpg`);
      let preprocessedInfo = null;

      if (pdfPath && pageNum) {
        // PDF page extraction path
        const tempPageJpg = path.join(__dirname, `../../public/temp/page-${jobId}`);
        await extractPdfPage(pdfPath, pageNum, tempPageJpg);
        
        const fullTempJpgPath = `${tempPageJpg}.jpg`;
        if (!fs.existsSync(fullTempJpgPath)) {
          throw new Error(`Extracted page file not found: ${fullTempJpgPath}`);
        }

        // Run preprocessing file-to-file
        try {
          preprocessedInfo = await ImagePreprocessor.preprocessFile(fullTempJpgPath, finalPageJpgPath);
        } catch (err) {
          console.warn(`[Preprocessing] Sharp preprocessing failed for job ${jobId}, keeping raw:`, err.message);
          fs.copyFileSync(fullTempJpgPath, finalPageJpgPath);
          preprocessedInfo = { diagnostics: { note: 'Preprocessing failed, fell back to raw' } };
        }
        
        // Cleanup raw extracted page immediately
        if (fs.existsSync(fullTempJpgPath)) {
          fs.unlinkSync(fullTempJpgPath);
        }
      } else {
        // Single image path: read from mongoJob.filePath
        const rawUploadedPath = mongoJob.filePath;
        if (!rawUploadedPath || !fs.existsSync(rawUploadedPath)) {
          throw new Error(`Raw uploaded file path not found: ${rawUploadedPath}`);
        }

        try {
          preprocessedInfo = await ImagePreprocessor.preprocessFile(rawUploadedPath, finalPageJpgPath);
        } catch (err) {
          console.warn(`[Preprocessing] Sharp preprocessing failed for job ${jobId}, keeping raw:`, err.message);
          fs.copyFileSync(rawUploadedPath, finalPageJpgPath);
          preprocessedInfo = { diagnostics: { note: 'Preprocessing failed, fell back to raw' } };
        }

        // Delete raw uploaded file immediately to save disk
        if (fs.existsSync(rawUploadedPath)) {
          fs.unlinkSync(rawUploadedPath);
        }
      }

      // Update Mongo Job (no buffer written)
      mongoJob.status = 'processing';
      mongoJob.filePath = finalPageJpgPath;
      mongoJob.buffer = undefined;
      mongoJob.result = {
        preprocessInfo: preprocessedInfo?.diagnostics || null
      };
      await mongoJob.save();

      // Enqueue to OCR queue
      await ocrQueue.addJob(jobId, {
        jobId,
        parentJobId,
        sessionId,
        pageNum,
        totalPages,
        filename: mongoJob.filename,
        mimetype: mongoJob.mimetype,
        filePath: finalPageJpgPath
      });

      await preprocessingQueue.completeJob(jobId);
      console.log(`[Preprocessing] Completed job ${jobId}`);
    } catch (err) {
      console.error(`[Preprocessing] Failed job ${job?.id || 'unknown'}:`, err.message);
      if (job) {
        await preprocessingQueue.failJob(job.id, err.message);
        await OCRJob.findByIdAndUpdate(job.id, { status: 'failed', error: err.message });
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}

/**
 * 2. OCR WORKER (Streaming File to MathPix API)
 */
async function startOcrWorker() {
  console.log('[Worker] OCR loop started');
  while (true) {
    let job = null;
    try {
      monitorMemory();

      // Throttle if active exams
      const activeExams = await hasActiveExams();
      if (activeExams) {
        console.log('[Worker:OCR] Active student exams detected. Throttling loops (sleeping 8s)...');
        await new Promise(r => setTimeout(r, 8000));
      }

      job = await ocrQueue.popJob('ocr-worker');
      if (!job) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        continue;
      }

      const { jobId, parentJobId, sessionId, pageNum, totalPages, filePath } = job.data;
      console.log(`[OCR] Processing job ${jobId}`);

      const mongoJob = await OCRJob.findById(jobId);
      if (!mongoJob) {
        throw new Error(`Job ${jobId} not found in database`);
      }

      const targetPath = filePath || mongoJob.filePath;
      if (!targetPath || !fs.existsSync(targetPath)) {
        throw new Error(`Preprocessed image file not found: ${targetPath}`);
      }

      // Call Mathpix OCR (Streams file directly from disk)
      const ocrResult = await OCRProviderAdapter.processImage(
        targetPath,
        mongoJob.mimetype || 'image/jpeg',
        mongoJob.filename || 'image.jpg'
      );

      const preprocessInfo = mongoJob.result?.preprocessInfo || null;

      // Save raw OCR data to MongoDB
      mongoJob.rawText = ocrResult.rawText || '';
      mongoJob.latex = ocrResult.latex || '';
      mongoJob.result = {
        ...ocrResult,
        preprocessInfo
      };
      mongoJob.buffer = undefined; // Drop raw buffer
      await mongoJob.save();

      // Enqueue to Parser queue
      await parserQueue.addJob(jobId, {
        jobId,
        parentJobId,
        sessionId,
        pageNum,
        totalPages,
        filePath: targetPath
      });

      await ocrQueue.completeJob(jobId);
      console.log(`[OCR] Completed job ${jobId}`);
    } catch (err) {
      console.error(`[OCR] Failed job ${job?.id || 'unknown'}:`, err.message);
      if (job) {
        await ocrQueue.failJob(job.id, err.message);
        await OCRJob.findByIdAndUpdate(job.id, { status: 'failed', error: err.message });
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}

/**
 * 3. PARSER WORKER
 */
async function startParserWorker() {
  console.log('[Worker] Parser loop started');
  while (true) {
    let job = null;
    try {
      monitorMemory();
      job = await parserQueue.popJob('parser-worker');
      if (!job) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        continue;
      }

      const { jobId, parentJobId, sessionId, pageNum, totalPages, filePath } = job.data;
      console.log(`[Parser] Processing job ${jobId}`);

      const mongoJob = await OCRJob.findById(jobId);
      if (!mongoJob) {
        throw new Error(`Job ${jobId} not found in database`);
      }

      const parseResult = await OCRPipeline.runParsing(mongoJob.result, mongoJob.filename);

      mongoJob.result = {
        ...mongoJob.result,
        parseResult
      };
      mongoJob.buffer = undefined;
      await mongoJob.save();

      // Enqueue to Validation queue
      await validationQueue.addJob(jobId, {
        jobId,
        parentJobId,
        sessionId,
        pageNum,
        totalPages,
        filePath
      });

      await parserQueue.completeJob(jobId);
      console.log(`[Parser] Completed job ${jobId}`);
    } catch (err) {
      console.error(`[Parser] Failed job ${job?.id || 'unknown'}:`, err.message);
      if (job) {
        await parserQueue.failJob(job.id, err.message);
        await OCRJob.findByIdAndUpdate(job.id, { status: 'failed', error: err.message });
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}

/**
 * 4. VALIDATION WORKER (Progressive updates and immediate disk cleanup)
 */
async function startValidationWorker() {
  console.log('[Worker] Validation loop started');
  while (true) {
    let job = null;
    try {
      monitorMemory();
      job = await validationQueue.popJob('validation-worker');
      if (!job) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        continue;
      }

      const { jobId, parentJobId, sessionId, pageNum, totalPages, filePath } = job.data;
      console.log(`[Validation] Processing job ${jobId}`);

      const mongoJob = await OCRJob.findById(jobId);
      if (!mongoJob) {
        throw new Error(`Job ${jobId} not found in database`);
      }

      const ocrResult = mongoJob.result;
      const parseResult = ocrResult.parseResult;
      const preprocessInfo = ocrResult.preprocessInfo;

      const targetPath = filePath || mongoJob.filePath;

      if (parseResult.blocked) {
        mongoJob.status = 'done';
        mongoJob.result = parseResult.blockedResponse;
        mongoJob.buffer = undefined;
        await mongoJob.save();

        // Cleanup image immediately
        if (targetPath && fs.existsSync(targetPath)) {
          try { fs.unlinkSync(targetPath); } catch (_) {}
        }

        await validationQueue.completeJob(jobId);
        continue;
      }

      const validationResult = OCRPipeline.runValidation(
        parseResult.parsedQuestions,
        ocrResult,
        parseResult.pageType,
        parseResult.sections,
        parseResult.totalRejected,
        preprocessInfo,
        mongoJob.filename
      );

      mongoJob.status = 'done';
      mongoJob.result = validationResult;
      mongoJob.buffer = undefined;
      await mongoJob.save();

      // Cloudinary image upload (from disk path)
      let scannedImageUrl = null;
      if (targetPath && fs.existsSync(targetPath)) {
        try {
          const cloudinaryResult = await uploadOnCloudinary(targetPath);
          if (cloudinaryResult?.secure_url) {
            scannedImageUrl = cloudinaryResult.secure_url;
          }
        } catch (cloudinaryErr) {
          console.error('[Validation] Cloudinary upload failure:', cloudinaryErr.message);
        }
      }

      // Merge into VerificationSession
      if (parentJobId && pageNum) {
        // Tag page number onto each question
        if (validationResult.parsedQuestions) {
          validationResult.parsedQuestions.forEach(q => {
            q.questionNumber = `${pageNum}-${q.questionNumber}`;
          });
        }

        const session = await VerificationQueueManager.getSession(sessionId);
        if (session) {
          // Filter out duplicate answers on retries
          const existingItems = (session.items || []).filter(item => !item.questionNumber.startsWith(`${pageNum}-`));
          const updatedItems = [...existingItems, ...(validationResult.parsedQuestions || [])];

          const children = await OCRJob.find({ filename: new RegExp(`^${parentJobId}_page_`) });
          const completedCount = children.filter(j => j.status === 'done' || j.id === jobId).length;
          const totalCount = children.length;
          const progress = Math.round((completedCount / totalCount) * 100);

          const isFullyDone = completedCount === totalCount;
          const status = isFullyDone ? 'completed' : 'processing';

          await VerificationQueueManager.updateSession(sessionId, {
            items: updatedItems,
            status,
            progress
          });

          // Delete preprocessed file on disk immediately (since it's validated and progressive session updated)
          if (targetPath && fs.existsSync(targetPath)) {
            try {
              fs.unlinkSync(targetPath);
              console.log(`[Validation] Cleaned up completed page file: ${targetPath}`);
            } catch (_) {}
          }

          if (isFullyDone) {
            // Mark parent job done
            await OCRJob.findByIdAndUpdate(parentJobId, { status: 'done' });

            // Cleanup child job records
            await OCRJob.deleteMany({ filename: new RegExp(`^${parentJobId}_page_`) });
            
            // Clean up parent PDF file from disk
            const parentJob = await OCRJob.findById(parentJobId);
            if (parentJob?.filename) {
              const pdfDiskPath = path.join(__dirname, `../../public/temp/${parentJob.filename}`);
              if (fs.existsSync(pdfDiskPath)) {
                try {
                  fs.unlinkSync(pdfDiskPath);
                  console.log(`[Validation] Cleaned up parent PDF from disk: ${pdfDiskPath}`);
                } catch (_) {}
              }
            }
            console.log(`[Validation] Compiled PDF session ${sessionId} successfully.`);
          } else {
            console.log(`[Validation] PDF progressive sync: Page ${pageNum} done, session progress ${progress}%`);
          }
        }
      } else if (sessionId) {
        // Single image flow
        await VerificationQueueManager.updateSession(sessionId, {
          items: validationResult.parsedQuestions,
          status: 'completed',
          progress: 100,
          scannedImageUrl: scannedImageUrl || undefined,
          pipelineMetadata: {
            pageType: validationResult.pageType,
            sectionsFound: validationResult.sections?.length || 0,
            totalExtracted: validationResult.parsedQuestions?.length || 0,
            totalRejected: validationResult.totalRejected || 0,
            sourceUsed: 'file',
            processingTimeMs: 0
          }
        });

        // Delete processed file on disk immediately
        if (targetPath && fs.existsSync(targetPath)) {
          try {
            fs.unlinkSync(targetPath);
            console.log(`[Validation] Cleaned up completed ocr image file: ${targetPath}`);
          } catch (_) {}
        }
        console.log(`[Validation] Session ${sessionId} completed successfully.`);
      }

      await validationQueue.completeJob(jobId);
      console.log(`[Validation] Completed job ${jobId}`);
    } catch (err) {
      console.error(`[Validation] Failed job ${job?.id || 'unknown'}:`, err.message);
      
      // Clean up failed files on disk
      if (job && job.data.filePath && fs.existsSync(job.data.filePath)) {
        try { fs.unlinkSync(job.data.filePath); } catch (_) {}
      }
      
      if (job) {
        await validationQueue.failJob(job.id, err.message);
        await OCRJob.findByIdAndUpdate(job.id, { status: 'failed', error: err.message });
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}

// Start worker process
if (require.main === module) {
  runWorker().catch(err => {
    console.error('Fatal worker error:', err);
    process.exit(1);
  });
}

module.exports = { runWorker };
