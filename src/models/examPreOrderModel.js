const mongoose = require('mongoose');

// Per-student, per-exam pre-shuffled question order, computed in the
// background when an exam is scheduled (see examPreOrderService) so that
// startAttempt() can serve an O(1) lookup instead of shuffling on the
// request path at exam-open time.
const examPreOrderSchema = new mongoose.Schema({
  examId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: true,
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
  },
  questionOrder: [{
    type: String,
    required: true,
  }],
}, {
  timestamps: true,
});

// Fast O(1) lookup per student per exam and prevents duplicate pre-orders.
examPreOrderSchema.index({ examId: 1, studentId: 1 }, { unique: true });

// Facilitates batch deletion when an exam is deleted/edited (invalidateExamOrders).
examPreOrderSchema.index({ examId: 1 });

// Auto-expire pre-orders well after any exam could plausibly still be running,
// so this collection doesn't grow unbounded across years of scheduled exams.
examPreOrderSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('ExamPreOrder', examPreOrderSchema);
