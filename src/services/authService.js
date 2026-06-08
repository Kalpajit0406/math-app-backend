const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Student = require('../models/studentModel');
const PhoneRecord = require('../models/phoneRecordModel');

const isTeacherBypassEnabled = () => {
  const flag = String(process.env.ALLOW_TEACHER_BYPASS || '').toLowerCase();
  return flag === 'true' || flag === '1' || flag === 'yes';
};

const getTeacherBypassPhone = () => process.env.TEACHER_BYPASS_PHONE || '';

const MAX_ATTEMPTS = 5;

const authService = {
  register: async (studentData) => {
    if (!studentData?.studentPhone) throw new Error('Student phone is required');
    if (!studentData?.password) throw new Error('Password is required');

    const phone = studentData.studentPhone;

    // Hashing of deviceBlueprint if provided
    let deviceFingerprint = null;
    let fingerprintHash = null;
    let deviceName = null;
    if (studentData.deviceBlueprint) {
      const crypto = require('crypto');
      const { androidId, model, manufacturer, appInstallId } = studentData.deviceBlueprint;
      const rawString = `${androidId || ''}_${model || ''}_${manufacturer || ''}_${appInstallId || ''}`;
      deviceFingerprint = crypto.createHash('sha256').update(rawString).digest('hex');
      fingerprintHash = crypto.createHash('sha256').update(deviceFingerprint).digest('hex');
      deviceName = `${manufacturer || ''} ${model || ''}`.trim() || 'Unknown Device';
    } else if (studentData.deviceFingerprint) {
      const crypto = require('crypto');
      deviceFingerprint = studentData.deviceFingerprint;
      fingerprintHash = crypto.createHash('sha256').update(deviceFingerprint).digest('hex');
      deviceName = 'Unknown Device';
    }

    const isCooldownActive = (blacklistedAt) => {
      if (!blacklistedAt) return false;
      const cooldownPeriod = 30 * 24 * 60 * 60 * 1000; // 30 days
      return (new Date() - new Date(blacklistedAt)) < cooldownPeriod;
    };

    // 1. Check phone blacklist
    const phoneRecord = await PhoneRecord.findOne({ phone });
    if (phoneRecord) {
      if (phoneRecord.blacklisted) {
        if (isCooldownActive(phoneRecord.blacklistedAt)) {
          throw new Error('Your phone number has been temporarily blacklisted for 30 days due to repeated rejection. Please contact Soumen Sir.');
        } else {
          // Cooldown expired
          phoneRecord.blacklisted = false;
          phoneRecord.attemptCount = 0;
          phoneRecord.blacklistedAt = undefined;
          await phoneRecord.save();
        }
      }
      if (phoneRecord.attemptCount >= 5) {
        throw new Error('Maximum registration attempts reached for this phone. Please contact Soumen Sir.');
      }
    }

    // 2. Check fingerprint blacklist
    if (deviceFingerprint) {
      const fpRecord = await PhoneRecord.findOne({ deviceFingerprint });
      if (fpRecord) {
        if (fpRecord.blacklisted) {
          if (isCooldownActive(fpRecord.blacklistedAt)) {
            throw new Error('This device has been temporarily blacklisted for 30 days due to repeated abuse. Please contact Soumen Sir.');
          } else {
            // Cooldown expired
            fpRecord.blacklisted = false;
            fpRecord.attemptCount = 0;
            fpRecord.blacklistedAt = undefined;
            await fpRecord.save();
          }
        }
        if (fpRecord.attemptCount >= 5) {
          throw new Error('Maximum registration attempts reached for this device. Please contact Soumen Sir.');
        }
      }

      // Prevent duplicate registration abuse (if there is an active/approved trial student with this fingerprint)
      const existingFingerprintUser = await Student.findOne({ 
        deviceFingerprint, 
        verified: true, 
        accountType: 'TRIAL' 
      });
      if (existingFingerprintUser) {
        throw new Error('A trial account has already been registered and approved on this device.');
      }
    }

    // 3. Handle existing student record
    let finalAttempts = 1;
    const existingUser = await Student.findOne({ studentPhone: phone });
    if (existingUser) {
      if (existingUser.isRejected) {
        finalAttempts = (existingUser.requestAttempts || 0) + 1;
        await Student.deleteOne({ _id: existingUser._id });
      } else {
        throw new Error('Student with this phone number already exists');
      }
    }

    // 4. Increment attempt count (upsert)
    await PhoneRecord.findOneAndUpdate(
      { phone },
      { $inc: { attemptCount: 1 }, $set: { lastAttemptAt: new Date() } },
      { upsert: true, returnDocument: 'after' }
    );

    if (deviceFingerprint) {
      await PhoneRecord.findOneAndUpdate(
        { deviceFingerprint },
        { $inc: { attemptCount: 1 }, $set: { lastAttemptAt: new Date() } },
        { upsert: true, returnDocument: 'after' }
      );
    }

    // 5. If trial registration, class level must be 11 or 12
    if (studentData.accountType === 'TRIAL') {
      const clsNum = Number(studentData.classNo);
      if (clsNum !== 11 && clsNum !== 12) {
        throw new Error('Free-tier/Trial registration is only allowed for Class 11 and Class 12.');
      }
    }

    // 6. Save student
    const hashedPassword = await bcrypt.hash(studentData.password, 10);
    const isTrial = studentData.accountType === 'TRIAL';
    
    const student = new Student({ 
      ...studentData, 
      password: hashedPassword,
      deviceFingerprint,
      fingerprintHash,
      lastKnownDevices: deviceName ? [deviceName] : [],
      requestAttempts: finalAttempts,
      accountStatus: 'PENDING'
    });
    return await student.save();
  },

  login: async (studentPhone, password, deviceBlueprint = null) => {
    const teacherBypassPhone = getTeacherBypassPhone();
    const crypto = require('crypto');

    // Hashing of deviceBlueprint if provided
    let deviceFingerprint = null;
    let fingerprintHash = null;
    let deviceName = null;
    if (deviceBlueprint) {
      const { androidId, model, manufacturer, appInstallId } = deviceBlueprint;
      const rawString = `${androidId || ''}_${model || ''}_${manufacturer || ''}_${appInstallId || ''}`;
      deviceFingerprint = crypto.createHash('sha256').update(rawString).digest('hex');
      fingerprintHash = crypto.createHash('sha256').update(deviceFingerprint).digest('hex');
      deviceName = `${manufacturer || ''} ${model || ''}`.trim() || 'Unknown Device';
    }

    // Check fingerprint blacklist
    if (deviceFingerprint) {
      const fpRecord = await PhoneRecord.findOne({ deviceFingerprint });
      if (fpRecord && fpRecord.blacklisted) {
        const cooldownPeriod = 30 * 24 * 60 * 60 * 1000; // 30 days
        if (fpRecord.blacklistedAt && (new Date() - new Date(fpRecord.blacklistedAt)) < cooldownPeriod) {
          throw new Error('This device has been temporarily blacklisted for 30 days due to repeated abuse. Please contact Soumen Sir.');
        }
      }
    }

    // 1. Explicitly opt-in for local/dev environments only.
    if (isTeacherBypassEnabled() && teacherBypassPhone && studentPhone === teacherBypassPhone) {
      let student = await Student.findOne({ studentPhone }).select('+passwordHash');
      if (!student || !student.passwordHash) {
        const bypassPasswordSeed = process.env.TEACHER_BYPASS_PASSWORD || `teacher-bypass:${teacherBypassPhone}`;
        const hashedPassword = await bcrypt.hash(bypassPasswordSeed, 10);
        if (!student) {
          student = new Student({
            firstName: 'Teacher',
            lastName: 'Admin',
            classNo: 10,
            language: 'English',
            studentPhone: teacherBypassPhone,
            guardianPhone: teacherBypassPhone,
            password: hashedPassword,
            accountType: 'ADMIN',
            accountStatus: 'APPROVED'
          });
        } else {
          student.password = hashedPassword;
        }
        await student.save();
      }

      // Check lockout on teacher bypass student
      const LOCKOUT_TIME = 15 * 60 * 1000;
      if (student.failedLoginAttempts >= 5 && student.lastFailedLoginAt) {
        const timeDiff = Date.now() - new Date(student.lastFailedLoginAt).getTime();
        if (timeDiff < LOCKOUT_TIME) {
          const minLeft = Math.ceil((LOCKOUT_TIME - timeDiff) / 60000);
          throw new Error(`Account temporarily locked due to consecutive failed login attempts. Please try again in ${minLeft} minute(s).`);
        }
      }

      const isMatch = await bcrypt.compare(password, student.passwordHash);
      if (!isMatch) {
        student.failedLoginAttempts = (student.failedLoginAttempts || 0) + 1;
        student.lastFailedLoginAt = new Date();
        await student.save();
        throw new Error('Invalid credentials');
      }

      const jwtSecret = process.env.JWT_SECRET || process.env.ACCESS_TOKEN_SECRET;
      if (!jwtSecret) throw new Error('JWT secret is not configured');

      student.failedLoginAttempts = 0;
      student.lastFailedLoginAt = undefined;
      student.jwtVersion = (student.jwtVersion || 0) + 1;
      if (deviceFingerprint) {
        student.deviceFingerprint = deviceFingerprint;
        student.fingerprintHash = fingerprintHash;
        if (!student.lastKnownDevices) student.lastKnownDevices = [];
        if (!student.lastKnownDevices.includes(deviceName)) {
          student.lastKnownDevices.push(deviceName);
          if (student.lastKnownDevices.length > 5) student.lastKnownDevices.shift();
        }
      }
      await student.save();

      const accessToken = jwt.sign(
        { id: student._id, phone: student.studentPhone, role: student.role, jwtVersion: student.jwtVersion },
        jwtSecret,
        { expiresIn: '24h' }
      );

      return { student, accessToken };
    }

    // 2. Standard Login Flow
    if (!studentPhone || !password) {
      throw new Error('Phone and password are required');
    }

    const student = await Student.findOne({ studentPhone }).select('+passwordHash');
    if (!student) throw new Error('Invalid credentials');

    // Check lockout on standard student
    const LOCKOUT_TIME = 15 * 60 * 1000;
    if (student.failedLoginAttempts >= 5 && student.lastFailedLoginAt) {
      const timeDiff = Date.now() - new Date(student.lastFailedLoginAt).getTime();
      if (timeDiff < LOCKOUT_TIME) {
        const minLeft = Math.ceil((LOCKOUT_TIME - timeDiff) / 60000);
        throw new Error(`Account temporarily locked due to consecutive failed login attempts. Please try again in ${minLeft} minute(s).`);
      }
    }

    const isMatch = await bcrypt.compare(password, student.passwordHash);
    if (!isMatch) {
      student.failedLoginAttempts = (student.failedLoginAttempts || 0) + 1;
      student.lastFailedLoginAt = new Date();
      await student.save();
      throw new Error('Invalid credentials');
    }

    const jwtSecret = process.env.JWT_SECRET || process.env.ACCESS_TOKEN_SECRET;
    if (!jwtSecret) throw new Error('JWT secret is not configured');

    student.failedLoginAttempts = 0;
    student.lastFailedLoginAt = undefined;
    student.jwtVersion = (student.jwtVersion || 0) + 1;
    if (deviceFingerprint) {
      student.deviceFingerprint = deviceFingerprint;
      student.fingerprintHash = fingerprintHash;
      if (!student.lastKnownDevices) student.lastKnownDevices = [];
      if (!student.lastKnownDevices.includes(deviceName)) {
        student.lastKnownDevices.push(deviceName);
        if (student.lastKnownDevices.length > 5) student.lastKnownDevices.shift();
      }
    }
    await student.save();

    const accessToken = jwt.sign(
      { id: student._id, phone: student.studentPhone, role: student.role, jwtVersion: student.jwtVersion },
      jwtSecret,
      { expiresIn: '24h' }
    );

    return { student, accessToken };
  }
};

module.exports = authService;
