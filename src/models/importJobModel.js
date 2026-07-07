const mongoose = require('mongoose');

const importJobSchema = new mongoose.Schema({
  sourceType: {
    type: String,
    enum: ['pdf', 'image', 'url', 'markdown', 'csv'],
    required: true,
    index: true,
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['queued', 'parsing', 'preview_ready', 'partially_saved', 'completed', 'failed'],
    default: 'queued',
    index: true,
  },
  totalItems: {
    type: Number,
    default: 0,
  },
  approvedItems: {
    type: Number,
    default: 0,
  },
  rejectedItems: {
    type: Number,
    default: 0,
  },
  failedItems: {
    type: Number,
    default: 0,
  },
  progress: {
    type: Number,
    default: 0, // 0 to 100 percentage
  },
  originalFilename: {
    type: String,
  },
  sourceUrl: {
    type: String,
  },
  rawSourceData: {
    type: String,
  },
  parserVersion: {
    type: String,
    default: '1.0.0',
  },
  errorMessage: {
    type: String,
  },
  backupKeyUsed: {
    type: Boolean,
    default: false,
  },
  startedAt: {
    type: Date,
  },
  completedAt: {
    type: Date,
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      ret.id = ret._id;
      delete ret.__v;
      return ret;
    }
  },
  toObject: {
    virtuals: true
  }
});

// Compatibility virtuals
importJobSchema.virtual('importType')
  .get(function() {
    return this.sourceType;
  })
  .set(function(val) {
    this.sourceType = val;
  });

importJobSchema.virtual('userId')
  .get(function() {
    return this.uploadedBy;
  })
  .set(function(val) {
    this.uploadedBy = val;
  });

importJobSchema.virtual('savedItems')
  .get(function() {
    return this.approvedItems;
  })
  .set(function(val) {
    this.approvedItems = val;
  });

module.exports = mongoose.model('ImportJob', importJobSchema);

