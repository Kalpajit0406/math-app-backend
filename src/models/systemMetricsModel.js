const mongoose = require('mongoose');

const systemMetricsSchema = new mongoose.Schema({
  metricType: {
    type: String,
    required: true,
    index: true,
    enum: [
      'ram_usage',
      'ocr_queue_depth',
      'api_latency',
      'failed_ocr_jobs',
      'retry_spikes',
      'extraction_accuracy',
      'quarantine_rate'
    ]
  },
  value: {
    type: Number,
    required: true
  },
  nodeName: {
    type: String,
    default: 'default-node',
    index: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { 
  timestamps: false 
});

// Auto-delete metrics older than 7 days to conserve MongoDB storage space on low-resource VPS
systemMetricsSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

module.exports = mongoose.model('SystemMetrics', systemMetricsSchema);
