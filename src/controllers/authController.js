const authService = require('../services/authService');
const PhoneRecord = require('../models/phoneRecordModel');

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
    const students = await Student.find({ accountType: { $nin: ['ADMIN', 'TEACHER'] } });
    const unverified = students.filter(s => s.accountStatus === 'PENDING');
    const verified = students.filter(s => s.accountStatus === 'APPROVED');
    const rejected = students.filter(s => s.accountStatus === 'REJECTED');
    
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

    const updated = await Student.findByIdAndUpdate(id, { accountStatus: 'APPROVED' }, { returnDocument: 'after' });
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

    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    student.accountStatus = 'REJECTED';
    await student.save();

    const phone = student.studentPhone;
    const deviceFingerprint = student.deviceFingerprint;

    // Increment attempt count in PhoneRecord and check limit
    const pRecord = await PhoneRecord.findOneAndUpdate(
      { phone },
      { $max: { attemptCount: student.requestAttempts }, $set: { lastAttemptAt: new Date() } },
      { upsert: true, returnDocument: 'after' }
    );

    if (deviceFingerprint) {
      await PhoneRecord.findOneAndUpdate(
        { deviceFingerprint },
        { $max: { attemptCount: student.requestAttempts }, $set: { lastAttemptAt: new Date() } },
        { upsert: true }
      );
    }

    // Blacklist the phone number and device fingerprint if this was their 5th (final) attempt
    if (student.requestAttempts >= 5 || (pRecord && pRecord.attemptCount >= 5)) {
      await PhoneRecord.findOneAndUpdate(
        { phone },
        { $set: { blacklisted: true, blacklistedAt: new Date() } }
      );
      if (deviceFingerprint) {
        await PhoneRecord.findOneAndUpdate(
          { deviceFingerprint },
          { $set: { blacklisted: true, blacklistedAt: new Date() } }
        );
      }
    }

    res.json({ success: true, message: 'Student rejected successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const blacklistStudent = async (req, res) => {
  try {
    const { id, blacklist } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, message: 'Student id is required' });
    }

    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const phone = student.studentPhone;
    const deviceFingerprint = student.deviceFingerprint;
    const shouldBlacklist = blacklist !== false;

    if (shouldBlacklist) {
      student.accountType = 'BLOCKED';
      student.verified = false;
      await student.save();

      await PhoneRecord.findOneAndUpdate(
        { phone },
        { $set: { blacklisted: true, blacklistedAt: new Date() } },
        { upsert: true }
      );
      if (deviceFingerprint) {
        await PhoneRecord.findOneAndUpdate(
          { deviceFingerprint },
          { $set: { blacklisted: true, blacklistedAt: new Date() } },
          { upsert: true }
        );
      }
      res.json({ success: true, message: 'Student blacklisted successfully' });
    } else {
      if (student.accountType === 'BLOCKED') {
        student.accountType = 'NORMAL';
        await student.save();
      }
      await PhoneRecord.findOneAndUpdate(
        { phone },
        { $set: { blacklisted: false, attemptCount: 0, blacklistedAt: undefined } }
      );
      if (deviceFingerprint) {
        await PhoneRecord.findOneAndUpdate(
          { deviceFingerprint },
          { $set: { blacklisted: false, attemptCount: 0, blacklistedAt: undefined } }
        );
      }
      res.json({ success: true, message: 'Student unblacklisted successfully' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateAccountStatus = async (req, res) => {
  try {
    const { id, accountType, isJoint, resetTrialLimits } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, message: 'Student id is required' });
    }

    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    if (accountType !== undefined) {
      if (!['NORMAL', 'TRIAL', 'JOINT', 'JOINT_ENTRANCE', 'PREMIUM', 'ADMIN', 'BLOCKED'].includes(accountType)) {
        return res.status(400).json({ success: false, message: 'Invalid account type' });
      }
      student.accountType = accountType;
      if (accountType === 'BLOCKED') {
        student.accountStatus = 'SUSPENDED';
      }
      if (accountType === 'NORMAL' || accountType === 'PREMIUM' || accountType === 'JOINT' || accountType === 'JOINT_ENTRANCE') {
        student.accountStatus = 'APPROVED';
      }
    }

    if (isJoint !== undefined) {
      student.isJoint = !!isJoint;
    }

    if (resetTrialLimits === true) {
      const SelfAssessmentUsage = require('../models/selfAssessmentUsageModel');
      await SelfAssessmentUsage.findOneAndUpdate(
        { studentId: student._id },
        { $set: { dailyGenerationCount: 0, lastGenerationDate: new Date() } },
        { upsert: true }
      );
      
      await PhoneRecord.findOneAndUpdate(
        { phone: student.studentPhone },
        { $set: { attemptCount: 0, blacklisted: false, blacklistedAt: undefined } }
      );
      if (student.deviceFingerprint) {
        await PhoneRecord.findOneAndUpdate(
          { deviceFingerprint: student.deviceFingerprint },
          { $set: { attemptCount: 0, blacklisted: false, blacklistedAt: undefined } }
        );
      }
      student.requestAttempts = 0;
    }

    await student.save();
    res.json({ success: true, message: 'Student status updated successfully', data: student });
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
      { accountStatus: 'APPROVED' }
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
      { accountStatus: 'REJECTED' }
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

const submitProfileEditRequest = async (req, res) => {
  try {
    const studentId = req.user.id;
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const { classNo, language, isJoint } = req.body;
    const targetClassNo = classNo !== undefined ? Number(classNo) : student.classNo;
    const targetIsJoint = isJoint !== undefined ? !!isJoint : student.isJoint;

    if (targetIsJoint && ![11, 12].includes(targetClassNo)) {
      return res.status(400).json({ success: false, message: 'Joint Entrance is only available for classes 11 and 12' });
    }

    if (classNo !== undefined) {
      const clsNum = Number(classNo);
      if (![9, 10, 11, 12].includes(clsNum)) {
        return res.status(400).json({ success: false, message: 'Invalid class number' });
      }

      if (clsNum !== student.classNo) {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const changesInLastYear = (student.classChangeHistory || []).filter(date => new Date(date) >= oneYearAgo).length;

        if (changesInLastYear >= 2) {
          return res.status(400).json({ success: false, message: 'You can only change your class twice a year' });
        }
      }
    }

    if (language !== undefined) {
      if (!['Bengali', 'English', 'Both'].includes(language)) {
        return res.status(400).json({ success: false, message: 'Invalid language value' });
      }
    }

    student.pendingProfileEdit = {
      classNo: classNo !== undefined ? Number(classNo) : student.classNo,
      language: language !== undefined ? language : student.language,
      isJoint: targetIsJoint,
      requestedAt: new Date()
    };

    await student.save();
    res.json({ success: true, message: 'Profile edit request submitted for approval', data: student });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getPendingProfileEdits = async (req, res) => {
  try {
    const students = await Student.find({ 'pendingProfileEdit.classNo': { $exists: true } });
    res.json({ success: true, data: students });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const approveProfileEdit = async (req, res) => {
  try {
    const { id, approve } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, message: 'Student id is required' });
    }

    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    if (!student.pendingProfileEdit || student.pendingProfileEdit.classNo === undefined) {
      return res.status(400).json({ success: false, message: 'No pending edit request found' });
    }

    if (approve === true || approve === 'true') {
      const oldClass = student.classNo;
      const newClass = student.pendingProfileEdit.classNo;

      student.classNo = newClass;
      student.language = student.pendingProfileEdit.language;
      if (student.pendingProfileEdit.isJoint !== undefined) {
        student.isJoint = student.pendingProfileEdit.isJoint;
      }

      if (oldClass !== newClass) {
        if (!student.classChangeHistory) {
          student.classChangeHistory = [];
        }
        student.classChangeHistory.push(new Date());
      }

      student.pendingProfileEdit = undefined;
      await student.save();
      res.json({ success: true, message: 'Profile edit approved successfully' });
    } else {
      student.pendingProfileEdit = undefined;
      await student.save();
      res.json({ success: true, message: 'Profile edit rejected/cleared' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getPhoneStatus = async (req, res) => {
  try {
    const { phone } = req.params;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone is required' });

    const record = await PhoneRecord.findOne({ phone: decodeURIComponent(phone).trim() });
    return res.json({
      success: true,
      data: {
        blacklisted: record?.blacklisted ?? false,
        attemptCount: record?.attemptCount ?? 0,
      }
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
  bulkDeleteStudents,
  submitProfileEditRequest,
  getPendingProfileEdits,
  approveProfileEdit,
  getPhoneStatus,
  blacklistStudent,
  updateAccountStatus,
};
