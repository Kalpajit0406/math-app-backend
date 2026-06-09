const TestConfig = require('../models/testConfigModel');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/apiError');

// @desc    Create new test configuration
// @route   POST /api/v1/tests
// @access  Public (or protected if middleware added)
const createTestConfig = asyncHandler(async (req, res) => {
  const {
    date,
    time,
    classNo,
    language,
    totalMarks,
    marksPQ,
    timePQ,
    negativeMarksPQ,
    chapters,
  } = req.body;

  // Basic validation
  if (
    !date ||
    !time ||
    !classNo ||
    !language ||
    !totalMarks ||
    marksPQ === undefined ||
    timePQ === undefined ||
    negativeMarksPQ === undefined ||
    !chapters
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const newTest = new TestConfig({
    date,
    time,
    classNo,
    language,
    totalMarks,
    marksPQ,
    timePQ,
    negativeMarksPQ,
    chapters,
  });

  const savedTest = await newTest.save();

  const auditLogService = require('../services/auditLogService');
  await auditLogService.log({
    actorId: req.user?.id,
    action: 'test_config_create',
    targetType: 'TestConfig',
    targetId: savedTest._id,
    metadata: {
      date: savedTest.date,
      time: savedTest.time,
      classNo: savedTest.classNo,
      language: savedTest.language
    }
  });

  return res.status(201).json({
    success: true,
    message: "Test configuration saved",
    test: savedTest
  });
});

// @desc    Fetch all student tests
// @route   GET /api/v1/tests
// @access  Public
const getAllStudentTests = asyncHandler(async (req, res) => {
  const tests = await TestConfig.find().sort({ createdAt: -1 });
  return res.status(200).json(tests);
});

// @desc    Fetch tests by class and language
// @route   GET /api/v1/tests/:classNo/:language
// @access  Public
const getTestsByClassAndLanguage = asyncHandler(async (req, res) => {
  const { classNo, language } = req.params;

  const validClasses = [9, 10, 11, 12];
  const validLanguages = ["Bengali", "English", "Both"];

  if (
    !validClasses.includes(Number(classNo)) ||
    !validLanguages.includes(language)
  ) {
    throw new ApiError(400, "Invalid class number or language");
  }

  let testLanguageFilter;
  if (language === "Both") {
    testLanguageFilter = { $in: ["Bengali", "English", "Both"] };
  } else {
    testLanguageFilter = { $in: [language, "Both"] };
  }

  const { getClassIdFromNo } = require('../utils/classCache');
  const classId = getClassIdFromNo(classNo);
  const tests = await TestConfig.find({
    classId: classId,
    language: testLanguageFilter,
  }).sort({ createdAt: -1 });

  return res.status(200).json(tests);
});

// @desc    Delete existing test configuration
// @route   DELETE /api/v1/tests/delete/:id
// @access  Public
const deleteTestConfig = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const deletedTest = await TestConfig.findByIdAndDelete(id);
  if (!deletedTest) {
    throw new ApiError(404, "Test configuration not found");
  }

  const auditLogService = require('../services/auditLogService');
  await auditLogService.log({
    actorId: req.user?.id,
    action: 'test_config_delete',
    targetType: 'TestConfig',
    targetId: deletedTest._id,
    metadata: {
      date: deletedTest.date,
      time: deletedTest.time,
      classNo: deletedTest.classNo,
      language: deletedTest.language
    }
  });

  return res.status(200).json({
    success: true,
    message: "Test configuration deleted",
    test: deletedTest
  });
});

module.exports = {
  createTestConfig,
  getAllStudentTests,
  getTestsByClassAndLanguage,
  deleteTestConfig,
};
