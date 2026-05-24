const Exam = require('../models/examModel');
const Question = require('../models/questionModel');

const normalizeExamData = async (examData = {}) => {
  const isSchedulePayload = !!(examData.date && examData.time && examData.classNo && examData.language);
  if (!isSchedulePayload) {
    return examData;
  }

  const title = examData.title || `Class ${examData.classNo} ${examData.language} Test`;
  const totalTime = Number.parseInt(examData.totalTime || examData.duration || '0', 10) || 0;
  const totalQuestions = Number.parseInt(examData.totalQuestions || examData.questions?.length || '0', 10) || 0;
  const negativeMarking = Number(examData.negativeMarking !== undefined ? examData.negativeMarking : 0.0);
  const marksPerQuestion = Number(examData.marksPerQuestion !== undefined ? examData.marksPerQuestion : 1.0);
  const chapters = Array.isArray(examData.chapters) ? examData.chapters : [];

  // Query random questions matching criteria
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
    { $sample: { size: totalQuestions || 10 } }
  ]);

  if (sampleQuestions.length === 0) {
    throw new Error(`No questions found matching the criteria (Class ${examData.classNo}, Language ${examData.language})`);
  }

  const questions = sampleQuestions.map(q => ({
    type: 'mcq',
    questionText: q.question,
    options: q.options,
    correctAnswer: q.correctAnswer
  }));

  return {
    ...examData,
    title,
    duration: totalTime,
    totalTime,
    totalQuestions,
    negativeMarking,
    marksPerQuestion,
    chapters,
    questions,
  };
};

const examService = {
  createExam: async (examData, userId) => {
    const normalizedData = await normalizeExamData(examData);
    const exam = new Exam({
      ...normalizedData,
      createdBy: userId,
    });
    return await exam.save();
  },

  getExams: async () => {
    return await Exam.find().sort({ createdAt: -1 });
  },

  getExamsForStudent: async (classNo, language) => {
    let testLanguageFilter;
    if (language === 'Both') {
      testLanguageFilter = { $in: ['Bengali', 'English', 'Both'] };
    } else {
      testLanguageFilter = { $in: [language, 'Both'] };
    }
    return await Exam.find({
      classNo: Number(classNo),
      language: testLanguageFilter,
    }).sort({ createdAt: -1 });
  },

  getExamById: async (id) => {
    const exam = await Exam.findById(id);
    if (!exam) throw new Error('Exam not found');
    return exam;
  }
};

module.exports = examService;
