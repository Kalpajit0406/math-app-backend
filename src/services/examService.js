const Exam = require('../models/examModel');
const Question = require('../models/questionModel');
const mongoose = require('mongoose');
const { getRedisClient } = require('../config/redis');

const normalizeExamData = async (examData = {}, session = null) => {
  const title = examData.title || `Class ${examData.classNo} ${examData.language} Test`;
  const totalTime = Number.parseInt(examData.totalTime || examData.duration || '0', 10) || 0;
  const negativeMarking = Number(examData.negativeMarking !== undefined ? examData.negativeMarking : 0.0);
  const marksPerQuestion = Number(examData.marksPerQuestion !== undefined ? examData.marksPerQuestion : 1.0);
  const chapters = Array.isArray(examData.chapters) ? examData.chapters : [];

  let questionIds = [...(examData.questionIds || [])];

  const opts = session ? { session } : {};

  // 1. If inline questions are provided, save them first
  if (Array.isArray(examData.questions) && examData.questions.length > 0) {
    const createdIds = [];
    const { normalizeQuestion, generateHash, generateContentHash } = require('./questionDuplicateDetector');
    for (const q of examData.questions) {
      if (q._id || q.id) {
        createdIds.push(q._id || q.id);
        continue;
      }
      const questionText = q.question || q.questionText || '';
      const cHash = generateContentHash({
        question: questionText,
        options: q.options || [],
        correctAnswer: q.correctAnswer || '',
        type: q.type || ((q.options && q.options.length > 0) ? 'mcq' : 'numeric')
      });

      const existingQ = session
        ? await Question.findOne({ contentHash: cHash }).session(session)
        : await Question.findOne({ contentHash: cHash });

      if (existingQ) {
        createdIds.push(existingQ._id);
        continue;
      }

      const newQ = await Question.create([{
        question: questionText,
        options: q.options || [],
        correctAnswer: q.correctAnswer || '',
        language: q.language || examData.language || 'English',
        classNo: Number(q.classNo || examData.classNo || 10),
        chapter: q.chapter || 'General',
      }], opts);
      createdIds.push(newQ[0]._id);
    }
    questionIds = [...questionIds, ...createdIds];
  }

  // 2. If it's a schedule payload and no questions were passed, sample randomly
  const isSchedulePayload = !!(examData.date && examData.time && examData.classNo && examData.language);
  if (isSchedulePayload && questionIds.length === 0) {
    const totalQuestions = Number.parseInt(examData.totalQuestions || '10', 10);
    const { getClassIdFromNo } = require('../utils/classCache');
    const filter = {
      classId: getClassIdFromNo(examData.classNo)
    };
    if (examData.language === 'Both') {
      filter.language = { $in: ['Bengali', 'English', 'Both'] };
    } else {
      filter.language = { $in: [examData.language, 'Both'] };
    }
    if (chapters.length > 0) {
      const { resolveChapterIds } = require('../utils/chapterNormalization');
      const resolvedChapterIds = await resolveChapterIds(examData.classNo, chapters);
      if (resolvedChapterIds.length > 0) {
        filter.chapterId = { $in: resolvedChapterIds };
      } else {
        filter.chapterId = new mongoose.Types.ObjectId();
      }
    }

    const aggregatePipeline = [
      { $match: filter },
      { $sample: { size: totalQuestions } }
    ];

    const sampleQuestions = session 
      ? await Question.aggregate(aggregatePipeline).session(session)
      : await Question.aggregate(aggregatePipeline);

    if (sampleQuestions.length < totalQuestions) {
      throw new Error(`Insufficient questions in database. Requested: ${totalQuestions}, Available: ${sampleQuestions.length} for Class ${examData.classNo}, Language ${examData.language}`);
    }

    questionIds = sampleQuestions.map(q => q._id);
  }

  const totalQuestions = questionIds.length;

  return {
    ...examData,
    title,
    duration: totalTime || examData.duration || 30,
    totalTime: totalTime || examData.duration || 30,
    totalQuestions,
    negativeMarking,
    marksPerQuestion,
    chapters,
    questionIds,
  };
};

const examService = {
  createExam: async (examData, userId) => {
    const session = await mongoose.startSession();
    let transactionStarted = false;
    try {
      try {
        await session.startTransaction();
        transactionStarted = true;
      } catch (err) {
        // Replica sets not enabled
      }

      const normalizedData = await normalizeExamData(examData, transactionStarted ? session : null);
      const exam = new Exam({
        ...normalizedData,
        createdBy: userId,
      });
      const saved = await exam.save({ session: transactionStarted ? session : undefined });

      if (transactionStarted) {
        await session.commitTransaction();
      }

      const populated = await Exam.findById(saved._id).populate('questions');

      // Clear student exams cache so new exam shows up instantly
      try {
        const redis = getRedisClient();
        if (redis && typeof redis.keys === 'function') {
          const keys = await redis.keys('exams:student:*');
          if (keys && keys.length > 0) {
            await redis.del(...keys);
          }
        }
      } catch (cacheErr) {
        console.warn('[Cache] Error clearing student exams cache on createExam:', cacheErr.message);
      }

      return populated;
    } catch (error) {
      if (transactionStarted && session.inTransaction()) {
        await session.abortTransaction();
      }
      throw error;
    } finally {
      session.endSession();
    }
  },

  getExams: async () => {
    return await Exam.find().sort({ createdAt: -1 });
  },

  getExamsForStudent: async (classNo, language, isJoint = false) => {
    // Cache key uses class+joint only — language no longer restricts which exams a student sees.
    // All students in the same class see all exams for that class.
    const cacheKey = `exams:student:class:${classNo}:joint:${isJoint}`;
    const redis = getRedisClient();
    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        const plainExams = JSON.parse(cachedData);
        // Attach id helper method to questions array for Mongoose compatibility
        plainExams.forEach(exam => {
          if (exam.questions) {
            exam.questions.id = function(id) {
              if (!id) return null;
              const idStr = id.toString();
              return this.find(q => (q.id || q._id) && (q.id || q._id).toString() === idStr);
            };
          }
        });
        return plainExams;
      }
    } catch (err) {
      console.warn('[Cache] getExamsForStudent cache read error:', err.message);
    }

    // NOTE: We intentionally do NOT filter by language here.
    // The exam's `language` field indicates which question medium was sampled,
    // not which students are eligible to see it. ALL students in the target class
    // should see ALL scheduled exams, regardless of their language preference.
    // This fixes the bug where Bengali-language students couldn't see English-medium exams.
    const query = {};

    const { getClassIdFromNo } = require('../utils/classCache');
    const classIdObj = getClassIdFromNo(classNo);

    if (isJoint && (Number(classNo) === 11 || Number(classNo) === 12)) {
      const Chapter = require('../models/chapterModel');
      const classId13 = getClassIdFromNo(13);
      const targetParentChapters = await Chapter.find({
        classId: classId13,
        normalizedChapterName: { $in: [String(classNo).toLowerCase(), 'joint', 'jee'] }
      }).select('_id');
      const parentIds = targetParentChapters.map(c => c._id);

      query.$or = [
        { classId: classIdObj },
        {
          classId: classId13,
          chapterIds: { $in: parentIds }
        }
      ];
    } else {
      query.classId = classIdObj;
    }

    const exams = await Exam.find(query).sort({ createdAt: -1 });

    try {
      const serialized = exams.map(e => e.toJSON());
      await redis.set(cacheKey, JSON.stringify(serialized), 'EX', 30); // 30 seconds TTL
    } catch (err) {
      console.warn('[Cache] getExamsForStudent cache write error:', err.message);
    }

    return exams;
  },

  getExamById: async (id) => {
    const cacheKey = `exam:id:${id}`;
    const redis = getRedisClient();
    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        const examObj = JSON.parse(cachedData);
        if (examObj.questions) {
          examObj.questions.id = function(id) {
            if (!id) return null;
            const idStr = id.toString();
            return this.find(q => (q.id || q._id) && (q.id || q._id).toString() === idStr);
          };
        }
        return examObj;
      }
    } catch (err) {
      console.warn('[Cache] getExamById cache read error:', err.message);
    }

    const exam = await Exam.findById(id);
    if (!exam) throw new Error('Exam not found');

    try {
      await redis.set(cacheKey, JSON.stringify(exam.toJSON()), 'EX', 300); // 5 minutes TTL
    } catch (err) {
      console.warn('[Cache] getExamById cache write error:', err.message);
    }

    return exam;
  }
};

module.exports = examService;
