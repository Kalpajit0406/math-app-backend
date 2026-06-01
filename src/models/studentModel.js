const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  dateOfBirth: { type: String, trim: true },
  gender: { type: String, enum: ['Male', 'Female', 'Other'] },
  classNo: { type: Number, enum: [9, 10, 11, 12], required: true },
  language: { type: String, enum: ['Bengali', 'English', 'Both'], required: true },
  isJoint: { type: Boolean, default: false },
  fatherName: { type: String, trim: true },
  motherName: { type: String, trim: true },
  studentPhone: { type: String, required: true, unique: true, trim: true },
  guardianPhone: { type: String, required: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['student', 'admin', 'teacher'], default: 'student' },
  verified: { type: Boolean, default: false },
  isRejected: { type: Boolean, default: false },
  classChangeHistory: [{ type: Date }],
  pendingProfileEdit: {
    classNo: { type: Number, enum: [9, 10, 11, 12] },
    language: { type: String, enum: ['Bengali', 'English', 'Both'] },
    isJoint: { type: Boolean },
    requestedAt: { type: Date }
  },
}, { 
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      ret.id = ret._id;
      // Also alias to match old backend if necessary
      ret.fullName = `${ret.firstName} ${ret.lastName}`;
      ret.studentMobile = ret.studentPhone;
      delete ret._id;
      delete ret.__v;
      delete ret.password;
      return ret;
    }
  }
});

module.exports = mongoose.model('Student', studentSchema);
