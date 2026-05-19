const Exam = require('../models/examModel');

const normalizeExamData = (examData = {}) => {
  const isSchedulePayload = examData.date && examData.time && examData.classNo && examData.language;
  if (!isSchedulePayload) {
    return examData;
  }

  const title = examData.title || `Class ${examData.classNo} ${examData.language} Test`;
  const totalTime = Number.parseInt(examData.totalTime || examData.duration || '0', 10) || 0;
  const totalQuestions = Number.parseInt(examData.totalQuestions || examData.questions?.length || '0', 10) || 0;

  return {
    ...examData,
    title,
    duration: totalTime,
    totalTime,
    totalQuestions,
    questions: Array.isArray(examData.questions) ? examData.questions : [],
  };
};

const examService = {
  createExam: async (examData, userId) => {
    const exam = new Exam({
      ...normalizeExamData(examData),
      createdBy: userId,
    });
    return await exam.save();
  },

  getExams: async () => {
    return await Exam.find().sort({ createdAt: -1 });
  },

  getExamById: async (id) => {
    const exam = await Exam.findById(id);
    if (!exam) throw new Error('Exam not found');
    return exam;
  }
};

module.exports = examService;
