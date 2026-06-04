const SelfAssessmentService = require('../services/selfAssessmentService');
const Student = require('../models/studentModel');

exports.generateAssessment = async (req, res) => {
  try {
    const studentId = req.user.id || req.user._id;
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found.'
      });
    }

    const classNo = student.classNo;
    const deviceFingerprint = req.headers['x-device-fingerprint'] || req.headers['user-agent'] || 'unknown';
    const { chapters, limit, time } = req.body;

    if (!classNo) {
      return res.status(400).json({
        success: false,
        message: 'Student profile missing class assignment.'
      });
    }

    const session = await SelfAssessmentService.generateAssessment(
      studentId,
      classNo,
      deviceFingerprint,
      chapters,
      limit,
      time
    );

    return res.status(201).json({
      success: true,
      data: session
    });
  } catch (error) {
    console.error('[SelfAssessment] Generation failed:', error.message);
    if (error.message.includes('COOLDOWN_LIMIT')) {
      return res.status(429).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate assessment'
    });
  }
};

exports.getChapters = async (req, res) => {
  try {
    const studentId = req.user.id || req.user._id;
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found.'
      });
    }

    const classNo = student.classNo;
    if (!classNo) {
      return res.status(400).json({
        success: false,
        message: 'Student profile missing class assignment.'
      });
    }

    const Question = require('../models/questionModel');
    const chapters = await Question.distinct('chapter', { classNo: Number(classNo), chapter: { $ne: null, $ne: "" } });
    chapters.sort();

    return res.json({
      success: true,
      data: chapters
    });
  } catch (error) {
    console.error('[SelfAssessment] Get chapters failed:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve chapters'
    });
  }
};

exports.getCurrentQuestion = async (req, res) => {
  try {
    const token = req.headers['x-assessment-token'] || req.query.token;
    const deviceFingerprint = req.headers['x-device-fingerprint'] || req.headers['user-agent'] || 'unknown';

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Assessment session token is required.'
      });
    }

    const question = await SelfAssessmentService.getCurrentQuestion(token, deviceFingerprint);
    return res.json({
      success: true,
      data: question
    });
  } catch (error) {
    console.error('[SelfAssessment] Question fetch failed:', error.message);
    return res.status(403).json({
      success: false,
      message: error.message || 'Access Denied'
    });
  }
};

exports.submitAnswer = async (req, res) => {
  try {
    const token = req.headers['x-assessment-token'] || req.body.token;
    const { questionId, selectedAnswer } = req.body;
    const deviceFingerprint = req.headers['x-device-fingerprint'] || req.headers['user-agent'] || 'unknown';

    if (!token || !questionId || selectedAnswer === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Token, questionId, and selectedAnswer are required.'
      });
    }

    const response = await SelfAssessmentService.submitAnswer(token, questionId, selectedAnswer, deviceFingerprint);
    return res.json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('[SelfAssessment] Response submission failed:', error.message);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to submit response'
    });
  }
};

exports.heartbeat = async (req, res) => {
  try {
    const token = req.headers['x-assessment-token'] || req.body.token;
    const deviceFingerprint = req.headers['x-device-fingerprint'] || req.headers['user-agent'] || 'unknown';

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Assessment session token is required.'
      });
    }

    const result = await SelfAssessmentService.heartbeat(token, deviceFingerprint);
    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: error.message || 'Session invalid'
    });
  }
};

exports.getQuestionsBatch = async (req, res) => {
  try {
    const token = req.headers['x-assessment-token'] || req.query.token;
    const { offset, limit } = req.query;
    const deviceFingerprint = req.headers['x-device-fingerprint'] || req.headers['user-agent'] || 'unknown';

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Assessment session token is required.'
      });
    }

    const result = await SelfAssessmentService.getQuestionsBatch(
      token,
      offset || 0,
      limit || 5,
      deviceFingerprint
    );

    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[SelfAssessment] Questions batch fetch failed:', error.message);
    return res.status(403).json({
      success: false,
      message: error.message || 'Access Denied'
    });
  }
};

exports.submitAllAnswers = async (req, res) => {
  try {
    const token = req.headers['x-assessment-token'] || req.body.token;
    const { answers } = req.body;
    const deviceFingerprint = req.headers['x-device-fingerprint'] || req.headers['user-agent'] || 'unknown';

    if (!token || !answers) {
      return res.status(400).json({
        success: false,
        message: 'Token and answers are required.'
      });
    }

    const response = await SelfAssessmentService.submitAllAnswers(token, answers, deviceFingerprint);
    return res.json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('[SelfAssessment] Bulk submission failed:', error.message);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to submit response'
    });
  }
};
