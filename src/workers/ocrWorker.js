const connectDB = require('../config/db');
const { OCRQueueService } = require('../services/ocrQueueService');
const { OCRPipeline } = require('../services/ocrPipeline');

const POLL_MS = Number.parseInt(process.env.OCR_WORKER_POLL_MS || '2000', 10);
const MAINTENANCE_EVERY_LOOPS = Number.parseInt(process.env.OCR_WORKER_MAINTENANCE_EVERY_LOOPS || '15', 10);

async function runWorkerLoop() {
  await connectDB();
  console.log('[ocrWorker] Connected to DB, starting worker loop');
  let loopCounter = 0;

  while (true) {
    try {
      loopCounter += 1;
      if (loopCounter % MAINTENANCE_EVERY_LOOPS === 0) {
        const recovery = await OCRQueueService.recoverStaleProcessingJobs();
        const deleted = await OCRQueueService.cleanupExpiredJobs();
        if (recovery.scanned > 0 || deleted > 0) {
          console.log('[ocrWorker] Maintenance:', { recovery, deleted });
        }
      }

      const pending = await OCRQueueService.getPending(5);
      if (!pending || pending.length === 0) {
        await new Promise(r => setTimeout(r, POLL_MS));
        continue;
      }

      for (const job of pending) {
        try {
          const workerId = `ocr-worker-${process.pid}-${Math.random().toString(36).substring(7)}`;
          const processingJob = await OCRQueueService.acquireJobLock(job._id, workerId, 'ocr-node-1');
          if (!processingJob) {
            // Lock already acquired by another worker node
            continue;
          }
          console.log(`[ocrWorker] Atomically acquired lock on job ${processingJob._id}`);
          const fs = require('fs');
          let fileBuffer = processingJob.buffer;
          if (!fileBuffer && processingJob.filePath && fs.existsSync(processingJob.filePath)) {
            fileBuffer = fs.readFileSync(processingJob.filePath);
          }
          if (!fileBuffer) {
            throw new Error('No image buffer or file path available for job.');
          }
          const res = await OCRPipeline.runFromBuffer(fileBuffer, processingJob.mimetype || 'image/jpeg', processingJob.filename || 'image.jpg');
          await OCRQueueService.markDone(processingJob._id, res, workerId);
          console.log(`[ocrWorker] Job ${processingJob._id} done`);
        } catch (err) {
          console.error(`[ocrWorker] Job ${job._id} failed: ${err.message}`);
          const latest = await OCRQueueService.getJob(job._id);
          const workerId = `ocr-worker-${process.pid}`;
          await OCRQueueService.markRetryOrFailed(latest || job, err.message || String(err), workerId);
        }
      }
    } catch (err) {
      console.error('[ocrWorker] Loop error:', err.message || err);
      await new Promise(r => setTimeout(r, POLL_MS));
    }
  }
}

if (require.main === module) {
  runWorkerLoop().catch(err => {
    console.error('ocrWorker fatal error:', err);
    process.exit(1);
  });
}

module.exports = { runWorkerLoop };
