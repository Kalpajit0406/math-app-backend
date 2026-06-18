const mongoose = require('mongoose');

const importJobSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: ['queued', 'parsing', 'preview_ready', 'partially_saved', 'saved', 'failed'],
    default: 'queued',
    index: true,
  },
  importType: {
    type: String,
    enum: ['pdf', 'image', 'url', 'markdown', 'csv'],
    required: true,
  },
  sourceFileName: {
    type: String,
  },
  rawSourceData: {
    type: String,
  },
  errorMessage: {
    type: String,
  },
  totalItems: {
    type: Number,
    default: 0,
  },
  savedItems: {
    type: Number,
    default: 0,
  },
  failedItems: {
    type: Number,
    default: 0,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  }
}, {
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      ret.id = ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

module.exports = mongoose.model('ImportJob', importJobSchema);
