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
        console.log(`[ocrWorker] Processing job ${job._id}`);
        try {
          const processingJob = await OCRQueueService.markProcessing(job._id);
          const res = await OCRPipeline.runFromBuffer(job.buffer, job.mimetype || 'image/jpeg', job.filename || 'image.jpg');
          await OCRQueueService.markDone(processingJob._id, res);
          console.log(`[ocrWorker] Job ${job._id} done`);
        } catch (err) {
          console.error(`[ocrWorker] Job ${job._id} failed: ${err.message}`);
          const latest = await OCRQueueService.getJob(job._id);
          await OCRQueueService.markRetryOrFailed(latest || job, err.message || String(err));
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
