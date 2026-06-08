const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: false,
    index: true
  },
  action: {
    type: String,
    required: true,
    index: true
  }, // e.g., 'permission_change', 'trial_approval', 'chapter_deletion', 'student_conversion', 'blacklist', 'exam_edit', 'question_edit'
  targetType: {
    type: String,
    required: true,
    index: true
  }, // e.g., 'Student', 'Chapter', 'Exam', 'Question'
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },
  ipAddress: {
    type: String,
    trim: true
  },
  deviceFingerprint: {
    type: String,
    trim: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  }
}, { 
  timestamps: true,
  strict: true
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
