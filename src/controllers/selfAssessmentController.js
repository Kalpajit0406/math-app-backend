const SelfAssessmentService = require('../services/selfAssessmentService');

exports.generateAssessment = async (req, res) => {
  try {
    const studentId = req.user.id || req.user._id;
    // Enforce class level from server-side user details (cannot be overridden by request params!)
    const classNo = req.user.classNo;
    const deviceFingerprint = req.headers['x-device-fingerprint'] || req.headers['user-agent'] || 'unknown';

    if (!classNo) {
      return res.status(400).json({
        success: false,
        message: 'Student profile missing class assignment.'
      });
    }

    const session = await SelfAssessmentService.generateAssessment(studentId, classNo, deviceFingerprint);
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
