const TestResponse = require('../models/testResponseModel');
const Student = require('../models/studentModel');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/apiError');

// Helper function to check test response existence
const findByStudentThenCheckTest = async (studentMobile, testId) => {
    try {
        // Step 1: Find all responses by studentMobile
        const studentResponses = await TestResponse.find({ studentMobile });
        
        if (studentResponses.length === 0) {
            return {
                found: false,
                studentHasResponses: false,
                hasTestResponse: false,
                responses: []
            };
        }
        
        // Step 2: Check if testId exists in those responses
        const testResponse = studentResponses.find(response => 
            response.testId.toString() === testId
        );
        
        return {
            found: testResponse !== undefined,
            studentHasResponses: true,
            hasTestResponse: testResponse !== undefined,
            responses: studentResponses,
            testResponse: testResponse || null
        };
    } catch (error) {
        console.error("Error in findByStudentThenCheckTest:", error);
        throw error;
    }
};

// @desc    Save student test response
// @route   POST /api/v1/testResponse
// @access  Protected (student)
const saveStudentTest = asyncHandler(async (req, res) => {
    const {
        date,
        time,
        studentMobile,
        testId,
        responses
    } = req.body;

    // Basic validation
    if (!date || !time || !studentMobile || !testId || !responses) {
        throw new ApiError(400, "All fields are required");
    }

    if (!req.user || !req.user.id) {
        throw new ApiError(401, "Unauthorized");
    }

    const student = await Student.findById(req.user.id);
    if (!student) {
        throw new ApiError(401, "Unauthorized");
    }

    if (student.studentPhone !== studentMobile) {
        throw new ApiError(403, "Forbidden: student mismatch");
    }

    // Delete existing response for the same student and testconfig to preserve historical responses of other tests
    await TestResponse.findOneAndDelete({ studentMobile, testId });

    // Save new Submission
    const newTestResponse = await TestResponse.create({
        date,
        time,
        studentMobile,
        testId,
        responses
    });

    return res.status(201).json({ 
        success: true,
        message: "Test responses saved successfully", 
        data: newTestResponse 
    });
});

// @desc    Check test response existence
// @route   GET /api/v1/testResponse/check/:studentMobile/:testId
// @access  Public/Protected
const checkTestResponse = asyncHandler(async (req, res) => {
    const { studentMobile, testId } = req.params;

    if (!studentMobile || !testId) {
        throw new ApiError(400, "Student mobile and test ID are required");
    }

    const result = await findByStudentThenCheckTest(studentMobile, testId);
    
    return res.status(200).json({
        success: true,
        message: "Test response check completed",
        data: {
            found: result.found,
            studentHasResponses: result.studentHasResponses,
            hasTestResponse: result.hasTestResponse,
            totalResponses: result.responses.length,
            testResponse: result.testResponse
        }
    });
});

// @desc    Get Student Test Response by studentMobile
// @route   GET /api/v1/testResponse/:studentMobile
// @access  Public/Protected
const getStudentTestResponse = asyncHandler(async (req, res) => {
    const { studentMobile } = req.params;
    if (!studentMobile) {
        throw new ApiError(400, "Student mobile is required");
    }

    const testResponse = await TestResponse.findOne({ studentMobile });
    if (!testResponse) {
        throw new ApiError(404, "No test response found for the given student mobile");
    }
    return res.status(200).json({
        success: true,
        message: "Test response retrieved successfully",
        data: testResponse
    });
});

// @desc    Get all test responses (for admin purposes)
// @route   GET /api/v1/testResponse/res/all
// @access  Protected
const getAllTestResponses = asyncHandler(async (req, res) => {
    const allResponses = await TestResponse.find();
    return res.status(200).json({
        success: true,
        message: "All test responses retrieved successfully",
        data: allResponses
    });
});

// @desc    Delete all responses by testId
// @route   DELETE /api/v1/testResponse/delete/:testId
// @access  Protected
const deleteAllTestResponsesById = asyncHandler(async (req, res) => {
    const { testId } = req.params;

    const deleteResult = await TestResponse.deleteMany({ testId });

    if (deleteResult.deletedCount === 0) {
        throw new ApiError(404, "No test responses found for this testId");
    }

    return res.status(200).json({
        success: true,
        message: `${deleteResult.deletedCount} test response(s) deleted successfully`,
    });
});

module.exports = {
    saveStudentTest,
    checkTestResponse,
    getStudentTestResponse,
    getAllTestResponses,
    deleteAllTestResponsesById
};
