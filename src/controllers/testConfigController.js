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
  const validLanguages = ["Bengali", "English"];

  if (
    !validClasses.includes(Number(classNo)) ||
    !validLanguages.includes(language)
  ) {
    throw new ApiError(400, "Invalid class number or language");
  }

  const tests = await TestConfig.find({
    classNo: Number(classNo),
    language,
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
