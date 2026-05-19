const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Student = require('../models/studentModel');

const authService = {
  register: async (studentData) => {
    if (!studentData?.studentPhone) throw new Error('Student phone is required');
    if (!studentData?.password) throw new Error('Password is required');

    const existingUser = await Student.findOne({ studentPhone: studentData.studentPhone });
    if (existingUser) throw new Error('Student with this phone number already exists');

    const hashedPassword = await bcrypt.hash(studentData.password, 10);
    const student = new Student({ ...studentData, password: hashedPassword });
    return await student.save();
  },

  login: async (studentPhone, password) => {
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
