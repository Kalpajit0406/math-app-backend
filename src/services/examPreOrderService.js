const crypto = require('crypto');
const Exam = require('../models/examModel');
const Student = require('../models/studentModel');
const ExamPreOrder = require('../models/examPreOrderModel');
const { AccountStatus } = require('../utils/constants');
const { shuffleArray } = require('../utils/examUtils');
const { getRedisClient } = require('../config/redis');

const PREORDER_TTL_SECONDS = 7 * 24 * 3600; // 7 days — comfortably covers any exam's lifetime

function preOrderCacheKey(examId, studentId) {
  return `exam:preorder:${examId}:${studentId}`;
}

/**
 * Deterministic seeded PRNG (mulberry32) fallback — produces an instant,
 * unique, 100% reproducible question order for a given (examId, studentId)
 * pair with zero database/Redis round-trips. Used whenever a student starts
 * an exam without a pre-computed order (late registration, class transfer,
 * or the background pre-computation simply hasn't run/finished yet), so
 * startAttempt() never has to block on a live shuffle under load.
 */
function getDeterministicQuestionOrder(examId, studentId, questionIds) {
  const hash = crypto
    .createHash('sha256')
    .update(`${examId.toString()}:${studentId.toString()}`)
    .digest('hex');

  let seed = parseInt(hash.substring(0, 8), 16);
  const random = () => {
    seed += 0x6D2B79F5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const shuffled = questionIds.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

const examPreOrderService = {
  /**
   * Background worker: pre-computes and persists a unique shuffled question
   * order for every currently-eligible, approved student for this exam.
   * Fire-and-forget — called right after exam creation without being
   * awaited by the HTTP response. Never throws to the caller; failures are
   * recorded on the Exam document and self-heal via the deterministic
   * fallback in getStudentQuestionOrder.
   */
  precomputeExamOrders: async (examId) => {
    try {
      const exam = await Exam.findById(examId);
      if (!exam || !exam.questionIds || exam.questionIds.length === 0) return;

      await Exam.findByIdAndUpdate(examId, { orderPreGenStatus: 'PROCESSING' });

      // Eligible students: approved accounts in the exam's class, plus (for
      // Joint Entrance exams) approved joint students in class 11/12. This is
      // intentionally a broad net rather than an exact replica of
      // examService.getExamsForStudent's chapter-level eligibility check —
      // over-including a few students just pre-computes an order they never
      // use (harmless); under-including is fully covered by the deterministic
      // fallback at start time, so precision here isn't correctness-critical.
      let studentFilter;
      if (exam.classNo === 13) {
        studentFilter = {
          accountStatus: AccountStatus.APPROVED,
          $or: [{ accountType: 'JOINT' }, { accountType: 'JOINT_ENTRANCE' }],
        };
      } else {
        studentFilter = { accountStatus: AccountStatus.APPROVED, classId: exam.classId };
      }

      const students = await Student.find(studentFilter).select('_id').lean();
      const examQuestionIds = exam.questionIds.map(id => String(id));

      if (students.length === 0) {
        await Exam.findByIdAndUpdate(examId, {
          orderPreGenStatus: 'READY',
          preGenStudentCount: 0,
          preGenCompletedAt: new Date(),
        });
        return;
      }

      const redis = getRedisClient();
      const BATCH_SIZE = 50;

      for (let i = 0; i < students.length; i += BATCH_SIZE) {
        const batch = students.slice(i, i + BATCH_SIZE);
        const bulkOps = [];
        const cacheWrites = [];

        for (const student of batch) {
          const shuffledOrder = shuffleArray(examQuestionIds);
          bulkOps.push({
            updateOne: {
              filter: { examId: exam._id, studentId: student._id },
              update: { $set: { questionOrder: shuffledOrder } },
              upsert: true,
            },
          });
          cacheWrites.push(
            redis.set(preOrderCacheKey(examId, student._id), JSON.stringify(shuffledOrder), 'EX', PREORDER_TTL_SECONDS)
              .catch(err => console.warn('[ExamPreOrder] Redis cache write failed for one student:', err.message))
          );
        }

        await ExamPreOrder.bulkWrite(bulkOps, { ordered: false });
        await Promise.all(cacheWrites);

        // Yield to the event loop so incoming HTTP requests (like /chapters) are not starved
        if (i + BATCH_SIZE < students.length) {
          await new Promise(resolve => setImmediate(resolve));
        }
      }

      await Exam.findByIdAndUpdate(examId, {
        orderPreGenStatus: 'READY',
        preGenStudentCount: students.length,
        preGenCompletedAt: new Date(),
      });

      console.log(`[ExamPreOrder] Pre-computed ${students.length} question orders for exam ${examId}`);
    } catch (err) {
      console.error(`[ExamPreOrder] Error pre-computing orders for exam ${examId}:`, err.message);
      try {
        await Exam.findByIdAndUpdate(examId, { orderPreGenStatus: 'FAILED' });
      } catch (_) { /* best-effort status update only */ }
    }
  },

  /**
   * Returns this student's question order for this exam, trying (in order):
   * Redis cache -> persisted ExamPreOrder document -> deterministic PRNG.
   * The final level never touches the network/DB and cannot fail, so this
   * function is guaranteed to resolve with a valid, non-empty order whenever
   * `examQuestionIds` is non-empty.
   */
  getStudentQuestionOrder: async (examId, studentId, examQuestionIds) => {
    const redis = getRedisClient();
    const cacheKey = preOrderCacheKey(examId, studentId);

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (err) {
      console.warn('[ExamPreOrder] Redis cache read failed, checking DB:', err.message);
    }

    try {
      const dbOrder = await ExamPreOrder.findOne({ examId, studentId }).lean();
      if (dbOrder && Array.isArray(dbOrder.questionOrder) && dbOrder.questionOrder.length > 0) {
        redis.set(cacheKey, JSON.stringify(dbOrder.questionOrder), 'EX', PREORDER_TTL_SECONDS).catch(() => {});
        return dbOrder.questionOrder;
      }
    } catch (err) {
      console.warn('[ExamPreOrder] DB lookup failed, falling back to deterministic order:', err.message);
    }

    const fallbackOrder = getDeterministicQuestionOrder(examId, studentId, examQuestionIds);
    redis.set(cacheKey, JSON.stringify(fallbackOrder), 'EX', PREORDER_TTL_SECONDS).catch(() => {});
    return fallbackOrder;
  },

  /**
   * Drops pre-computed orders and cache entries for an exam — call when an
   * exam's question set changes or the exam is deleted, so stale orders
   * (referencing removed/edited questions) can't leak through.
   */
  invalidateExamOrders: async (examId) => {
    const redis = getRedisClient();
    try {
      await ExamPreOrder.deleteMany({ examId });
    } catch (err) {
      console.error(`[ExamPreOrder] Error deleting pre-orders for exam ${examId}:`, err.message);
    }
    try {
      if (typeof redis.keys === 'function') {
        const keys = await redis.keys(`exam:preorder:${examId}:*`);
        if (keys && keys.length > 0) {
          await redis.del(...keys);
        }
      }
    } catch (err) {
      console.error(`[ExamPreOrder] Error clearing Redis cache for exam ${examId}:`, err.message);
    }
  },
};

module.exports = examPreOrderService;
