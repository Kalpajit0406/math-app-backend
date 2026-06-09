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
    return OCRJob.find({ 
      $or: [
        { status: 'pending', availableAt: { $lte: new Date() } },
        { status: 'processing', lockExpiresAt: { $lt: new Date() } }
      ]
    }).sort({ queuePriority: -1, createdAt: 1 }).limit(limit).exec();
  }

  static async acquireJobLock(jobId, workerId, nodeName = 'default-node', lockDurationMs = 300000) {
    const now = new Date();
    const query = {
      _id: jobId,
      $or: [
        { status: 'pending', availableAt: { $lte: now } },
        { status: 'processing', lockExpiresAt: { $lt: now } }
      ]
    };
    const update = {
      $set: {
        status: 'processing',
        lockedBy: workerId,
        processingNode: nodeName,
        lockAcquiredAt: now,
        lockExpiresAt: new Date(Date.now() + lockDurationMs),
        updatedAt: now
      },
      $inc: { retryCount: 1, attempts: 1 }
    };
    return OCRJob.findOneAndUpdate(query, update, { new: true }).exec();
  }

  static async renewJobLock(jobId, workerId, lockDurationMs = 300000) {
    const now = new Date();
    const query = {
      _id: jobId,
      status: 'processing',
      lockedBy: workerId
    };
    const update = {
      $set: {
        lockExpiresAt: new Date(Date.now() + lockDurationMs),
        updatedAt: now
      }
    };
    return OCRJob.findOneAndUpdate(query, update, { new: true }).exec();
  }

  static async markProcessing(jobId) {
    // Legacy support method: acquires a default lock
    const workerId = `legacy-worker-${process.pid}`;
    return this.acquireJobLock(jobId, workerId);
  }

  static async markDone(jobId, result, workerId = null) {
    const query = { _id: jobId };
    if (workerId) {
      query.lockedBy = workerId;
    }
    return OCRJob.findOneAndUpdate(
      query,
      {
        $set: {
          status: 'done',
          result,
          rawText: result?.rawText || '',
          latex: result?.latex || '',
          updatedAt: Date.now(),
          lockedBy: null,
          lockAcquiredAt: null,
          lockExpiresAt: null,
          processingNode: null,
          availableAt: new Date(),
          error: null,
        }
      },
      { new: true }
    ).exec();
  }

  static async markFailed(jobId, error, workerId = null) {
    const query = { _id: jobId };
    if (workerId) {
      query.lockedBy = workerId;
    }
    return OCRJob.findOneAndUpdate(
      query,
      { 
        $set: { 
          status: 'failed', 
          error: String(error), 
          updatedAt: Date.now(), 
          lockedBy: null,
          lockAcquiredAt: null,
          lockExpiresAt: null,
          processingNode: null
        } 
      },
      { new: true }
    ).exec();
  }

  static async markRetryOrFailed(job, error, workerId = null) {
    const attempts = job?.retryCount ?? job?.attempts ?? 0;
    const maxRetries = job?.maxRetries ?? this.maxAttempts;
    const reachedCap = attempts >= maxRetries;

    if (reachedCap) {
      return this.markFailed(job._id, `[final] ${String(error)}`, workerId);
    }

    const delay = this.retryBaseMs * Math.pow(2, Math.max(0, attempts - 1));
    const nextAt = new Date(Date.now() + delay);
    
    const query = { _id: job._id };
    if (workerId) {
      query.lockedBy = workerId;
    }

    return OCRJob.findOneAndUpdate(
      query,
      {
        $set: {
          status: 'pending',
          error: String(error),
          updatedAt: Date.now(),
          availableAt: nextAt,
          lockedBy: null,
          lockAcquiredAt: null,
          lockExpiresAt: null,
          processingNode: null
        }
      },
      { new: true }
    ).exec();
  }

  static async getJob(jobId) {
    return OCRJob.findById(jobId).exec();
  }

  static async recoverStaleProcessingJobs() {
    const now = new Date();
    // A job is stale if locked and lock has expired, OR if status is processing and updatedAt is older than staleProcessingMs
    const staleBefore = new Date(Date.now() - this.staleProcessingMs);
    const query = {
      status: 'processing',
      $or: [
        { lockExpiresAt: { $lt: now } },
        { updatedAt: { $lte: staleBefore } }
      ]
    };
    const staleJobs = await OCRJob.find(query).limit(100).exec();
    let recovered = 0;
    let failed = 0;

    for (const job of staleJobs) {
      const attempts = job.retryCount ?? job.attempts ?? 0;
      const maxRetries = job.maxRetries ?? this.maxAttempts;
      if (attempts >= maxRetries) {
        await this.markFailed(job._id, '[reaper] stale processing exceeded max attempts');
        failed++;
      } else {
        await OCRJob.findByIdAndUpdate(job._id, {
          $set: {
            status: 'pending',
            availableAt: new Date(),
            lockedBy: null,
            lockAcquiredAt: null,
            lockExpiresAt: null,
            processingNode: null,
            updatedAt: Date.now(),
            error: '[reaper] stale processing lock recovered'
          }
        }).exec();
        recovered++;
      }
    }

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
