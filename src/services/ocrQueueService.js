const OCRJob = require('../models/ocrJobModel');

class OCRQueueService {
  static async enqueueFromBuffer({ buffer, mimetype, filename, sourceType = 'file' }) {
    const job = new OCRJob({ buffer, mimetype, filename, sourceType, status: 'pending' });
    await job.save();
    return job;
  }

  static async getPending(limit = 10) {
    return OCRJob.find({ status: 'pending' }).sort({ createdAt: 1 }).limit(limit).exec();
  }

  static async markProcessing(jobId) {
    return OCRJob.findByIdAndUpdate(jobId, { status: 'processing', attempts: { $inc: 1 }, updatedAt: Date.now() }, { new: true }).exec();
  }

  static async markDone(jobId, result) {
    return OCRJob.findByIdAndUpdate(jobId, { status: 'done', result, updatedAt: Date.now() }).exec();
  }

  static async markFailed(jobId, error) {
    return OCRJob.findByIdAndUpdate(jobId, { status: 'failed', error: String(error), updatedAt: Date.now() }).exec();
  }

  static async getJob(jobId) {
    return OCRJob.findById(jobId).exec();
  }
}

module.exports = { OCRQueueService };
