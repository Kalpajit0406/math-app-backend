const examService = require('../services/examService');
const Student = require('../models/studentModel');

const createExam = async (req, res) => {
  try {
    const exam = await examService.createExam(req.body, req.user.id);

    const auditLogService = require('../services/auditLogService');
    await auditLogService.log({
      actorId: req.user.id,
      action: 'exam_create',
      targetType: 'Exam',
      targetId: exam._id,
      metadata: {
        title: exam.title,
        classNo: exam.classNo,
        questionCount: exam.questionIds ? exam.questionIds.length : 0
      }
    });

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
      exams = await examService.getExamsForStudent(student.classNo, student.language, !!student.isJoint);
      // Strip correct answers for security
      exams = exams.map(exam => {
        const examObj = exam.toObject ? exam.toObject() : exam;
        if (examObj.questions) {
          examObj.questions = examObj.questions.map(q => {
            delete q.correctAnswer;
            return q;
          });
        }
        return examObj;
      });
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
    const examObj = exam.toObject ? exam.toObject() : exam;
    // Strip correct answers if retrieved by a student
    if (req.user && req.user.role === 'student' && examObj.questions) {
      examObj.questions = examObj.questions.map(q => {
        delete q.correctAnswer;
        return q;
      });
    }
    res.json({ success: true, data: examObj });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};

module.exports = { createExam, getExams, getExamById };
