const connectDB = require('../config/db');
const { OCRQueueService } = require('../services/ocrQueueService');
const { OCRPipeline } = require('../services/ocrPipeline');

const POLL_MS = Number.parseInt(process.env.OCR_WORKER_POLL_MS || '2000', 10);

async function runWorkerLoop() {
  await connectDB();
  console.log('[ocrWorker] Connected to DB, starting worker loop');

  while (true) {
    try {
      const pending = await OCRQueueService.getPending(5);
      if (!pending || pending.length === 0) {
        await new Promise(r => setTimeout(r, POLL_MS));
        continue;
      }

      for (const job of pending) {
        console.log(`[ocrWorker] Processing job ${job._id}`);
        try {
          await OCRQueueService.markProcessing(job._id);
          const res = await OCRPipeline.runFromBuffer(job.buffer, job.mimetype || 'image/jpeg', job.filename || 'image.jpg');
          await OCRQueueService.markDone(job._id, res);
          console.log(`[ocrWorker] Job ${job._id} done`);
        } catch (err) {
          console.error(`[ocrWorker] Job ${job._id} failed: ${err.message}`);
          await OCRQueueService.markFailed(job._id, err.message || String(err));
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
