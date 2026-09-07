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

    // Fire-and-forget: pre-compute per-student shuffled question orders in
    // the background so exam-open time serves an O(1) lookup instead of
    // shuffling for every student on the request path. Runs after the
    // response is sent, so exam creation is never slowed down by it.
    const examPreOrderService = require('../services/examPreOrderService');
    examPreOrderService.precomputeExamOrders(exam._id).catch(err => {
      console.error('[ExamPreOrder] precomputeExamOrders failed to start:', err.message);
    });
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
      const { getClassNoFromId } = require('../utils/classCache');
      const classNo = student.classNo || getClassNoFromId(student.classId) || 10;
      const isJoint = student.accountType === 'JOINT' || student.accountType === 'JOINT_ENTRANCE' || student.targetExam === 'Joint Entrance' || student.targetExam === 'JEE' || !!student.isJoint;
      exams = await examService.getExamsForStudent(classNo, student.language || 'Both', isJoint);
      // SECURITY: withhold question content entirely from the pre-start
      // listing (previously only correctAnswer was stripped, but full
      // question text/options/diagrams were still sent to every eligible
      // student's device hours or days before the exam opens). The full,
      // ordered, correctAnswer-free questions are now delivered only at
      // /testResponse/start, once the exam's start window has actually
      // opened — see attemptService.startAttempt.
      exams = exams.map(exam => {
        const examObj = exam.toObject ? exam.toObject() : exam;
        examObj.totalQuestions = examObj.totalQuestions || (examObj.questionIds ? examObj.questionIds.length : 0);
        delete examObj.questions;
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
