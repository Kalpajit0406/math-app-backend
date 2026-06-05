const mongoose = require('mongoose');

const syncVersionSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  value: {
    type: Number,
    required: true,
    default: 1,
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('SyncVersion', syncVersionSchema);
