const examService = require('../services/examService');
const Student = require('../models/studentModel');

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
    let exams;
    if (req.user && req.user.role === 'student') {
      const student = await Student.findById(req.user.id);
      if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }
      exams = await examService.getExamsForStudent(student.classNo, student.language);
    } else {
      exams = await examService.getExams();
    }
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
