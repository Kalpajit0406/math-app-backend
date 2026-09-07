/**
 * Exam Pre-Order (per-student shuffled question order) Test Suite
 *
 * Pure logic tests only — Redis and the ExamPreOrder model are stubbed via
 * require.cache so this suite never opens a real Redis or MongoDB
 * connection. Covers the bug this feature replaces (a live per-request
 * shuffle that could silently degrade to canonical order under a bad id
 * match, see Exam.applyQuestionOrder on the Flutter side) and the safety
 * property that matters most here: getStudentQuestionOrder must always
 * resolve to a valid, unique-per-student order even with no cache/DB data.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// ─── Stub Redis (in-memory Map) so no real connection is attempted ─────────
const redisConfigPath = require.resolve('../src/config/redis');
const redisStore = new Map();
require.cache[redisConfigPath] = {
  id: redisConfigPath,
  filename: redisConfigPath,
  loaded: true,
  exports: {
    getRedisClient: () => ({
      get: async (k) => (redisStore.has(k) ? redisStore.get(k) : null),
      set: async (k, v) => { redisStore.set(k, v); return 'OK'; },
      del: async (...ks) => { ks.flat().forEach(k => redisStore.delete(k)); return ks.length; },
      keys: async (pattern) => {
        const re = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return [...redisStore.keys()].filter(k => re.test(k));
      },
    }),
  },
};

// ─── Stub the ExamPreOrder model (in-memory Map) so no real Mongo connection
// is attempted ───────────────────────────────────────────────────────────
const examPreOrderModelPath = require.resolve('../src/models/examPreOrderModel');
const dbStore = new Map(); // key: `${examId}:${studentId}` -> questionOrder
require.cache[examPreOrderModelPath] = {
  id: examPreOrderModelPath,
  filename: examPreOrderModelPath,
  loaded: true,
  exports: {
    findOne: ({ examId, studentId }) => ({
      lean: async () => {
        const rec = dbStore.get(`${examId}:${studentId}`);
        return rec ? { questionOrder: rec } : null;
      },
    }),
    bulkWrite: async (ops) => {
      ops.forEach(op => {
        const f = op.updateOne.filter;
        dbStore.set(`${f.examId}:${f.studentId}`, op.updateOne.update.$set.questionOrder);
      });
      return { ok: 1 };
    },
  },
};

const examPreOrderService = require('../src/services/examPreOrderService');
const { orderSanitizedQuestions } = require('../src/services/examService');

test('examPreOrderService.getStudentQuestionOrder', async (t) => {
  const questionIds = Array.from({ length: 20 }, (_, i) => `q${i}`);

  await t.test('deterministic fallback is stable across repeated calls for the same student', async () => {
    const first = await examPreOrderService.getStudentQuestionOrder('examA', 'studentA', questionIds);
    // Clear the Redis cache entry so the second call re-derives the order
    // from scratch (rather than just reading back the same cached value),
    // proving the underlying PRNG itself is deterministic, not just the cache.
    redisStore.clear();
    const second = await examPreOrderService.getStudentQuestionOrder('examA', 'studentA', questionIds);
    assert.deepEqual(first, second);
  });

  await t.test('two different students get different orders for the same exam', async () => {
    redisStore.clear();
    const orderA = await examPreOrderService.getStudentQuestionOrder('examB', 'studentX', questionIds);
    redisStore.clear();
    const orderB = await examPreOrderService.getStudentQuestionOrder('examB', 'studentY', questionIds);
    assert.notDeepEqual(orderA, orderB);
  });

  await t.test('fallback order never drops or duplicates a question id', async () => {
    redisStore.clear();
    const order = await examPreOrderService.getStudentQuestionOrder('examC', 'studentZ', questionIds);
    assert.deepEqual([...order].sort(), [...questionIds].sort());
  });

  await t.test('prefers a persisted ExamPreOrder record over the deterministic fallback', async () => {
    redisStore.clear();
    dbStore.set('examD:studentW', ['q5', 'q1', 'q9']);
    const order = await examPreOrderService.getStudentQuestionOrder('examD', 'studentW', ['q1', 'q5', 'q9']);
    assert.deepEqual(order, ['q5', 'q1', 'q9']);
  });

  await t.test('a Redis cache hit short-circuits the DB lookup entirely', async () => {
    redisStore.clear();
    dbStore.delete('examE:studentV');
    redisStore.set('exam:preorder:examE:studentV', JSON.stringify(['q2', 'q1']));
    const order = await examPreOrderService.getStudentQuestionOrder('examE', 'studentV', ['q1', 'q2']);
    assert.deepEqual(order, ['q2', 'q1']);
  });
});

test('examService.orderSanitizedQuestions', async (t) => {
  const questions = [
    { id: 'a', question: 'Q-A', options: ['1', '2', '3', '4'], correctAnswer: 'X', diagram: null },
    { id: 'b', question: 'Q-B', options: ['1', '2', '3', '4'], correctAnswer: 'Y', diagram: null },
    { id: 'c', question: 'Q-C', options: [], correctAnswer: 'Z', diagram: null },
    { id: 'd', question: 'Q-D', options: ['1', '2', '3', '4'], correctAnswer: 'W', diagram: null },
  ];

  await t.test('never leaks correctAnswer', () => {
    const result = orderSanitizedQuestions(questions, ['c', 'a', 'b', 'd']);
    assert.ok(result.every(q => !('correctAnswer' in q)));
  });

  await t.test('applies the given order fully when every id matches', () => {
    const result = orderSanitizedQuestions(questions, ['d', 'b', 'a', 'c']);
    assert.deepEqual(result.map(q => q.id), ['d', 'b', 'a', 'c']);
  });

  await t.test('appends unmatched questions instead of discarding the whole order (partial-match resilience)', () => {
    // 'z' is a stale id no longer present in `questions`; 'd' is simply
    // absent from orderIds — neither should break ordering for the rest.
    const result = orderSanitizedQuestions(questions, ['c', 'z', 'a']);
    assert.deepEqual(result.map(q => q.id), ['c', 'a', 'b', 'd']);
    assert.equal(result.length, questions.length);
  });

  await t.test('infers mcq vs numeric type from options length', () => {
    const result = orderSanitizedQuestions(questions, ['a', 'c']);
    assert.equal(result.find(q => q.id === 'a').type, 'mcq');
    assert.equal(result.find(q => q.id === 'c').type, 'numeric');
  });

  await t.test('returns questions unchanged in original order when orderIds is empty', () => {
    const result = orderSanitizedQuestions(questions, []);
    assert.deepEqual(result.map(q => q.id), ['a', 'b', 'c', 'd']);
  });
});
