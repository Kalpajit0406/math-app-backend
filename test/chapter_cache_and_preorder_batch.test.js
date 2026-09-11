'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// ─── Test 1: Exam PreOrder Batching Logic ────────────────────────────────────
test('examPreOrderService batches students in chunks of 50', async (t) => {
  const redisStore = new Map();
  const bulkWrites = [];

  // Stub redis
  const redisConfigPath = require.resolve('../src/config/redis');
  require.cache[redisConfigPath] = {
    id: redisConfigPath,
    filename: redisConfigPath,
    loaded: true,
    exports: {
      getRedisClient: () => ({
        set: async (k, v) => { redisStore.set(k, v); return 'OK'; },
        get: async (k) => redisStore.get(k) || null,
        del: async (...ks) => { ks.flat().forEach(k => redisStore.delete(k)); return ks.length; },
        keys: async (pattern) => [...redisStore.keys()],
      }),
    },
  };

  // Stub ExamPreOrder model
  const examPreOrderModelPath = require.resolve('../src/models/examPreOrderModel');
  require.cache[examPreOrderModelPath] = {
    id: examPreOrderModelPath,
    filename: examPreOrderModelPath,
    loaded: true,
    exports: {
      bulkWrite: async (ops) => {
        bulkWrites.push(ops);
        return { ok: 1 };
      },
    },
  };

  // Stub Exam model
  const examModelPath = require.resolve('../src/models/examModel');
  require.cache[examModelPath] = {
    id: examModelPath,
    filename: examModelPath,
    loaded: true,
    exports: {
      findById: async () => ({
        _id: 'exam_test_1',
        classNo: 10,
        classId: 'class_10',
        questionIds: ['q1', 'q2', 'q3'],
      }),
      findByIdAndUpdate: async () => ({}),
    },
  };

  // Stub Student model (120 students to trigger 3 batches: 50, 50, 20)
  const studentModelPath = require.resolve('../src/models/studentModel');
  const dummyStudents = Array.from({ length: 120 }, (_, i) => ({ _id: `student_${i}` }));
  require.cache[studentModelPath] = {
    id: studentModelPath,
    filename: studentModelPath,
    loaded: true,
    exports: {
      find: () => ({
        select: () => ({
          lean: async () => dummyStudents,
        }),
      }),
    },
  };

  delete require.cache[require.resolve('../src/services/examPreOrderService')];
  const examPreOrderService = require('../src/services/examPreOrderService');

  await examPreOrderService.precomputeExamOrders('exam_test_1');

  // Should have executed bulkWrite 3 times (50 + 50 + 20)
  assert.equal(bulkWrites.length, 3);
  assert.equal(bulkWrites[0].length, 50);
  assert.equal(bulkWrites[1].length, 50);
  assert.equal(bulkWrites[2].length, 20);

  // All 120 students should have Redis cache entries
  assert.equal(redisStore.size, 120);
});

// ─── Test 2: Chapter Controller Caching & Invalidation ───────────────────────
test('chapterController getChapters uses Redis cache and invalidates on incrementSyncVersion', async (t) => {
  const redisStore = new Map();
  let dbQueryCount = 0;

  const redisConfigPath = require.resolve('../src/config/redis');
  require.cache[redisConfigPath] = {
    id: redisConfigPath,
    filename: redisConfigPath,
    loaded: true,
    exports: {
      getRedisClient: () => ({
        get: async (k) => redisStore.get(k) || null,
        set: async (k, v) => { redisStore.set(k, v); return 'OK'; },
        del: async (...ks) => {
          ks.flat().forEach(k => redisStore.delete(k));
          return ks.length;
        },
        keys: async (pattern) => {
          const re = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
          return [...redisStore.keys()].filter(k => re.test(k));
        },
      }),
    },
  };

  const chapterModelPath = require.resolve('../src/models/chapterModel');
  require.cache[chapterModelPath] = {
    id: chapterModelPath,
    filename: chapterModelPath,
    loaded: true,
    exports: {
      find: () => ({
        sort: async () => {
          dbQueryCount++;
          return [
            {
              _id: 'ch1',
              chapterName: 'Real Numbers',
              toJSON: () => ({ _id: 'ch1', chapterName: 'Real Numbers' }),
            },
          ];
        },
      }),
    },
  };

  const questionModelPath = require.resolve('../src/models/questionModel');
  require.cache[questionModelPath] = {
    id: questionModelPath,
    filename: questionModelPath,
    loaded: true,
    exports: {
      aggregate: async () => [{ _id: 'ch1', count: 15 }],
    },
  };

  const syncVersionModelPath = require.resolve('../src/models/syncVersionModel');
  require.cache[syncVersionModelPath] = {
    id: syncVersionModelPath,
    filename: syncVersionModelPath,
    loaded: true,
    exports: {
      findOneAndUpdate: async () => ({ value: 2 }),
    },
  };

  delete require.cache[require.resolve('../src/controllers/chapterController')];
  const chapterController = require('../src/controllers/chapterController');

  // Call 1: should hit DB
  let responseData1 = null;
  await chapterController.getChapters({ query: {} }, {
    json: (data) => { responseData1 = data; },
  });

  assert.equal(dbQueryCount, 1);
  assert.equal(responseData1.success, true);
  assert.equal(responseData1.data[0].questionCount, 15);
  assert.ok(redisStore.has('chapters:list:all'));

  // Call 2: should hit Redis cache (dbQueryCount stays 1)
  let responseData2 = null;
  await chapterController.getChapters({ query: {} }, {
    json: (data) => { responseData2 = data; },
  });

  assert.equal(dbQueryCount, 1, 'Second call must be served from cache without querying DB');
  assert.deepEqual(responseData1, responseData2);

  // Invalidate cache
  await chapterController.incrementSyncVersion();
  assert.equal(redisStore.has('chapters:list:all'), false, 'Cache must be cleared on incrementSyncVersion');

  // Call 3: should re-query DB because cache was invalidated
  await chapterController.getChapters({ query: {} }, {
    json: () => {},
  });
  assert.equal(dbQueryCount, 2, 'Third call must query DB after cache invalidation');
});
