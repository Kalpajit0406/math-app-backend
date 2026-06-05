const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
  classId: {
    type: Number,
    required: true,
    unique: true,
    index: true,
  },
  className: {
    type: String,
    required: true,
    trim: true,
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Class', classSchema);
