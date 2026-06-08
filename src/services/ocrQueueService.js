const OCRJob = require('../models/ocrJobModel');

class OCRQueueService {
  static get maxAttempts() {
    return Number.parseInt(process.env.OCR_MAX_ATTEMPTS || '3', 10);
  }

  static get retryBaseMs() {
    return Number.parseInt(process.env.OCR_RETRY_BASE_MS || '3000', 10);
  }

  static get staleProcessingMs() {
    return Number.parseInt(process.env.OCR_STALE_PROCESSING_MS || '180000', 10);
  }

  static get retentionMs() {
    return Number.parseInt(process.env.OCR_RESULT_RETENTION_MS || `${24 * 60 * 60 * 1000}`, 10);
  }

  static async enqueueFromBuffer({ buffer, mimetype, filename, sourceType = 'file' }) {
    const fs = require('fs');
    const path = require('path');
    
    // Create temp directory if it doesn't exist
    const tempDir = path.join(__dirname, '../../public/temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const ext = filename.split('.').pop() || 'jpg';
    const diskPath = path.join(tempDir, `ocr-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`);
    fs.writeFileSync(diskPath, buffer);

    const job = new OCRJob({ 
      filePath: diskPath, 
      mimetype, 
      filename, 
      sourceType, 
      status: 'pending', 
      availableAt: new Date() 
    });
    await job.save();
    return job;
  }

  static async getPending(limit = 10) {
    return OCRJob.find({ status: 'pending', availableAt: { $lte: new Date() } }).sort({ createdAt: 1 }).limit(limit).exec();
  }

  static async markProcessing(jobId) {
    return OCRJob.findByIdAndUpdate(
      jobId,
      { $set: { status: 'processing', lockedAt: new Date(), updatedAt: Date.now() }, $inc: { attempts: 1 } },
      { returnDocument: 'after' }
    ).exec();
  }

  static async markDone(jobId, result) {
    return OCRJob.findByIdAndUpdate(
      jobId,
      {
        $set: {
          status: 'done',
          result,
          rawText: result?.rawText || '',
          latex: result?.latex || '',
          updatedAt: Date.now(),
          lockedAt: null,
          availableAt: new Date(),
          error: null,
        }
      }
    ).exec();
  }

  static async markFailed(jobId, error) {
    return OCRJob.findByIdAndUpdate(
      jobId,
      { $set: { status: 'failed', error: String(error), updatedAt: Date.now(), lockedAt: null } }
    ).exec();
  }

  static async markRetryOrFailed(job, error) {
    const attempts = job?.attempts || 0;
    const reachedCap = attempts >= this.maxAttempts;

    if (reachedCap) {
      return this.markFailed(job._id, `[final] ${String(error)}`);
    }

    const delay = this.retryBaseMs * Math.pow(2, Math.max(0, attempts - 1));
    const nextAt = new Date(Date.now() + delay);
    return OCRJob.findByIdAndUpdate(
      job._id,
      {
        $set: {
          status: 'pending',
          error: String(error),
          updatedAt: Date.now(),
          availableAt: nextAt,
          lockedAt: null,
        }
      },
      { returnDocument: 'after' }
    ).exec();
  }

  static async getJob(jobId) {
    return OCRJob.findById(jobId).exec();
  }

  static async recoverStaleProcessingJobs() {
    const staleBefore = new Date(Date.now() - this.staleProcessingMs);
    const staleJobs = await OCRJob.find({ status: 'processing', updatedAt: { $lte: staleBefore } }).limit(100).exec();
    let recovered = 0;
    let failed = 0;

    for (const job of staleJobs) {
      if ((job.attempts || 0) >= this.maxAttempts) {
        await this.markFailed(job._id, '[reaper] stale processing exceeded max attempts');
        failed++;
      } else {
        await OCRJob.findByIdAndUpdate(job._id, {
          $set: {
            status: 'pending',
            availableAt: new Date(),
            lockedAt: null,
            updatedAt: Date.now(),
            error: '[reaper] stale processing recovered'
          }
        }).exec();
        recovered++;
      }
    }

    return { recovered, failed, scanned: staleJobs.length };
  }

  static async cleanupExpiredJobs() {
    const fs = require('fs');
    const cutoff = new Date(Date.now() - this.retentionMs);
    
    // Find jobs that are about to be deleted to unlink their files
    const jobs = await OCRJob.find({ status: { $in: ['done', 'failed'] }, updatedAt: { $lte: cutoff } }).select('filePath').exec();
    for (const job of jobs) {
      if (job.filePath && fs.existsSync(job.filePath)) {
        try {
          fs.unlinkSync(job.filePath);
        } catch (err) {
          console.error(`[OCRQueue] Failed to delete file ${job.filePath}:`, err.message);
        }
      }
    }

    const result = await OCRJob.deleteMany({ status: { $in: ['done', 'failed'] }, updatedAt: { $lte: cutoff } }).exec();
    return result?.deletedCount || 0;
  }
}

module.exports = { OCRQueueService };
