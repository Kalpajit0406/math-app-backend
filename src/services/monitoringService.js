const SystemMetrics = require('../models/systemMetricsModel');
const OCRJob = require('../models/ocrJobModel');

const FLUSH_INTERVAL_MS = 60000; // 60 seconds
let metricsBuffer = [];

class MonitoringService {
  /**
   * Add a metric to the buffer
   */
  static trackMetric(metricType, value, metadata = {}) {
    metricsBuffer.push({
      metricType,
      value,
      nodeName: process.env.NODE_NAME || `node-${process.pid}`,
      metadata,
      timestamp: new Date()
    });
  }

  /**
   * Flush metrics in the buffer to MongoDB
   */
  static async flushMetrics() {
    if (metricsBuffer.length === 0) return;
    const batch = [...metricsBuffer];
    metricsBuffer = [];
    try {
      await SystemMetrics.insertMany(batch);
    } catch (err) {
      console.error('[MonitoringService] Failed to flush metrics:', err.message);
      // Put back in buffer for next flush attempt
      metricsBuffer = [...batch, ...metricsBuffer];
    }
  }

  /**
   * Periodically sample system RAM and OCR Queue Depth
   */
  static async sampleSystemStats() {
    try {
      // 1. RAM Usage (in MB)
      const memory = process.memoryUsage();
      const rssMB = Math.round(memory.rss / 1024 / 1024);
      this.trackMetric('ram_usage', rssMB);

      // 2. OCR Queue Depth
      const pendingCount = await OCRJob.countDocuments({ status: 'pending' });
      const processingCount = await OCRJob.countDocuments({ status: 'processing' });
      this.trackMetric('ocr_queue_depth', pendingCount + processingCount, { pendingCount, processingCount });

      // 3. Quarantine & Failures
      const quarantined = await OCRJob.countDocuments({ 'result.extractionState': 'QUARANTINED' });
      const failed = await OCRJob.countDocuments({ status: 'failed' });
      if (failed > 0) {
        this.trackMetric('failed_ocr_jobs', failed);
      }
    } catch (err) {
      console.error('[MonitoringService] Stats sampling failed:', err.message);
    }
  }
}

// Start periodic flushing and stats sampling
if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    MonitoringService.sampleSystemStats();
  }, 30000); // sample every 30s

  setInterval(() => {
    MonitoringService.flushMetrics();
  }, FLUSH_INTERVAL_MS); // flush every 60s
}

module.exports = MonitoringService;
