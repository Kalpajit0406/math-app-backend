const authService = require('../services/authService');

const register = async (req, res) => {
  try {
    const student = await authService.register(req.body);
    res.status(201).json({ success: true, data: student });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { studentPhone, password } = req.body;
    if (!studentPhone || !password) {
      return res.status(400).json({ success: false, message: 'Phone and password are required' });
    }
    const data = await authService.login(studentPhone, password);
    // Note: data contains { student, accessToken }
    res.json({ success: true, data });
  } catch (error) {
    res.status(401).json({ success: false, message: error.message });
  }
};

const Student = require('../models/studentModel');

const me = async (req, res) => {
  try {
    const student = await Student.findById(req.user.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    res.json({ success: true, data: student });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAllStudents = async (req, res) => {
  try {
    const students = await Student.find({ role: 'student' });
    const unverified = students.filter(s => !s.verified && !s.isRejected);
    const verified = students.filter(s => s.verified);
    const rejected = students.filter(s => s.isRejected);
    
    res.json({
      success: true,
      data: {
        unverified,
        verified,
        rejected
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const acceptStudent = async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, message: 'Student id is required' });
    }

    const updated = await Student.findByIdAndUpdate(id, { verified: true, isRejected: false }, { new: true });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    res.json({ success: true, message: 'Student accepted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const rejectStudent = async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, message: 'Student id is required' });
    }

    const updated = await Student.findByIdAndUpdate(id, { verified: false, isRejected: true }, { new: true });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    res.json({ success: true, message: 'Student rejected' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const bulkAcceptStudents = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Student ids must be a non-empty array' });
    }
    const result = await Student.updateMany(
      { _id: { $in: ids } },
      { verified: true, isRejected: false }
    );
    res.json({
      success: true,
      message: `${result.modifiedCount || 0} student(s) accepted`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const bulkRejectStudents = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Student ids must be a non-empty array' });
    }
    const result = await Student.updateMany(
      { _id: { $in: ids } },
      { verified: false, isRejected: true }
    );
    res.json({
      success: true,
      message: `${result.modifiedCount || 0} student(s) rejected`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const bulkDeleteStudents = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Student ids must be a non-empty array' });
    }
    const result = await Student.deleteMany({ _id: { $in: ids } });
    res.json({
      success: true,
      message: `${result.deletedCount || 0} student(s) deleted`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  register,
  login,
  me,
  getAllStudents,
  acceptStudent,
  rejectStudent,
  bulkAcceptStudents,
  bulkRejectStudents,
  bulkDeleteStudents
};
