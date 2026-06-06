const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Student = require('../models/studentModel');

const isTeacherBypassEnabled = () => {
  const flag = String(process.env.ALLOW_TEACHER_BYPASS || '').toLowerCase();
  return flag === 'true' || flag === '1' || flag === 'yes';
};

const getTeacherBypassPhone = () => process.env.TEACHER_BYPASS_PHONE || '';

const authService = {
  register: async (studentData) => {
    if (!studentData?.studentPhone) throw new Error('Student phone is required');
    if (!studentData?.password) throw new Error('Password is required');

    const existingUser = await Student.findOne({ studentPhone: studentData.studentPhone });
    if (existingUser) {
      // Allow rejected students to re-register: wipe their old record so they
      // get a clean slate. Pending and verified accounts are still blocked.
      if (existingUser.isRejected) {
        await Student.deleteOne({ _id: existingUser._id });
      } else {
        throw new Error('Student with this phone number already exists');
      }
    }

    const hashedPassword = await bcrypt.hash(studentData.password, 10);
    const student = new Student({ ...studentData, password: hashedPassword });
    return await student.save();
  },

  login: async (studentPhone, password) => {
    const teacherBypassPhone = getTeacherBypassPhone();

    // Explicitly opt-in for local/dev environments only.
    if (isTeacherBypassEnabled() && teacherBypassPhone && studentPhone === teacherBypassPhone) {
      let student = await Student.findOne({ studentPhone });
      if (!student) {
        const bypassPasswordSeed = process.env.TEACHER_BYPASS_PASSWORD || `teacher-bypass:${teacherBypassPhone}`;
        const hashedPassword = await bcrypt.hash(bypassPasswordSeed, 10);
        student = new Student({
          firstName: 'Teacher',
          lastName: 'Admin',
          classNo: 10,
          language: 'English',
          studentPhone: teacherBypassPhone,
          guardianPhone: teacherBypassPhone,
          password: hashedPassword,
          role: 'teacher',
          verified: true
        });
        await student.save();
      }

      // Enforce credentials check even on bypass account to close the bypass backdoor!
      const isMatch = await bcrypt.compare(password, student.password);
      if (!isMatch) throw new Error('Invalid credentials');

      const jwtSecret = process.env.JWT_SECRET || process.env.ACCESS_TOKEN_SECRET;
      if (!jwtSecret) throw new Error('JWT secret is not configured');

      const accessToken = jwt.sign(
        { id: student._id, phone: student.studentPhone, role: student.role },
        jwtSecret,
        { expiresIn: '24h' }
      );

      return {
        student,
        accessToken
      };
    }

    // 2. Standard Login Flow
    if (!studentPhone || !password) {
      throw new Error('Phone and password are required');
    }

    const student = await Student.findOne({ studentPhone });
    if (!student) throw new Error('Invalid credentials');

    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch) throw new Error('Invalid credentials');

    const jwtSecret = process.env.JWT_SECRET || process.env.ACCESS_TOKEN_SECRET;
    if (!jwtSecret) throw new Error('JWT secret is not configured');

    const accessToken = jwt.sign(
      { id: student._id, phone: student.studentPhone, role: student.role }, 
      jwtSecret, 
      { expiresIn: '24h' }
    );

    return { 
      student, 
      accessToken 
    };
  }
};

module.exports = authService;
