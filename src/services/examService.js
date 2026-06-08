const Exam = require('../models/examModel');
const Question = require('../models/questionModel');

const normalizeExamData = async (examData = {}) => {
  const title = examData.title || `Class ${examData.classNo} ${examData.language} Test`;
  const totalTime = Number.parseInt(examData.totalTime || examData.duration || '0', 10) || 0;
  const negativeMarking = Number(examData.negativeMarking !== undefined ? examData.negativeMarking : 0.0);
  const marksPerQuestion = Number(examData.marksPerQuestion !== undefined ? examData.marksPerQuestion : 1.0);
  const chapters = Array.isArray(examData.chapters) ? examData.chapters : [];

  let questionIds = [...(examData.questionIds || [])];

  // 1. If inline questions are provided, save them first
  if (Array.isArray(examData.questions) && examData.questions.length > 0) {
    const createdIds = [];
    for (const q of examData.questions) {
      if (q._id || q.id) {
        createdIds.push(q._id || q.id);
        continue;
      }
      const newQ = await Question.create({
        question: q.question || q.questionText || '',
        options: q.options || [],
        correctAnswer: q.correctAnswer || '',
        language: q.language || examData.language || 'English',
        classNo: Number(q.classNo || examData.classNo || 10),
        chapter: q.chapter || 'General',
      });
      createdIds.push(newQ._id);
    }
    questionIds = [...questionIds, ...createdIds];
  }

  // 2. If it's a schedule payload and no questions were passed, sample randomly
  const isSchedulePayload = !!(examData.date && examData.time && examData.classNo && examData.language);
  if (isSchedulePayload && questionIds.length === 0) {
    const totalQuestions = Number.parseInt(examData.totalQuestions || '10', 10);
    const filter = {
      classNo: Number(examData.classNo)
    };
    if (examData.language === 'Both') {
      filter.language = { $in: ['Bengali', 'English', 'Both'] };
    } else {
      filter.language = { $in: [examData.language, 'Both'] };
    }
    if (chapters.length > 0) {
      filter.chapter = { $in: chapters };
    }

    const sampleQuestions = await Question.aggregate([
      { $match: filter },
      { $sample: { size: totalQuestions } }
    ]);

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
    const normalizedData = await normalizeExamData(examData);
    const exam = new Exam({
      ...normalizedData,
      createdBy: userId,
    });
    const saved = await exam.save();
    return await saved.populate('questions');
  },

  getExams: async () => {
    return await Exam.find().sort({ createdAt: -1 });
  },

  getExamsForStudent: async (classNo, language, isJoint = false) => {
    let testLanguageFilter;
    if (language === 'Both') {
      testLanguageFilter = { $in: ['Bengali', 'English', 'Both'] };
    } else {
      testLanguageFilter = { $in: [language, 'Both'] };
    }
    
    const query = {
      language: testLanguageFilter,
    };

    if (isJoint && (Number(classNo) === 11 || Number(classNo) === 12)) {
      query.$or = [
        { classNo: Number(classNo) },
        {
          classNo: 13,
          chapters: { $in: [String(classNo), 'Joint'] }
        }
      ];
    } else {
      query.classNo = Number(classNo);
    }

    return await Exam.find(query).sort({ createdAt: -1 });
  },

  getExamById: async (id) => {
    const exam = await Exam.findById(id);
    if (!exam) throw new Error('Exam not found');
    return exam;
  }
};

module.exports = examService;
