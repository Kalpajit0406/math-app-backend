const examService = require('../services/examService');

const createExam = async (req, res) => {
  try {
    const exam = await examService.createExam(req.body, req.user.id);
    res.status(201).json({ success: true, data: exam });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getExams = async (req, res) => {
  try {
    const exams = await examService.getExams();
    res.json({ success: true, data: exams });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getExamById = async (req, res) => {
  try {
    const exam = await examService.getExamById(req.params.id);
    res.json({ success: true, data: exam });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};

module.exports = { createExam, getExams, getExamById };
