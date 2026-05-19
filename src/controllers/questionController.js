const Question = require('../models/questionModel');
const { uploadOnCloudinary } = require('../utils/cloudinary');
const { PaginationParams, paginate, formatPaginatedResponse } = require('../utils/pagination');

const addQuestion = async (req, res) => {
  try {
    const {
      chapter,
      classNo,
      correctAnswer,
      options,
      question,
      language
    } = req.body;

    // Parse options if sent as JSON string
    let parsedOptions = options;
    if (typeof options === "string") {
      try {
        parsedOptions = JSON.parse(options);
      } catch (e) {
        return res.status(400).json({ success: false, message: "Invalid options format" });
      }
    }

    if (!chapter || !classNo || !correctAnswer || !parsedOptions || !question || !language) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    // Handle diagram upload if present
    let diagramUrl = null;
    if (req.file) {
      const uploadResult = await uploadOnCloudinary(req.file.path);
      if (uploadResult?.secure_url) {
        diagramUrl = uploadResult.secure_url;
      }
    }

    const newQuestion = await Question.create({
      chapter,
      classNo: parseInt(classNo),
      correctAnswer,
      options: parsedOptions,
      question,
      language,
      diagram: diagramUrl
    });

    res.status(201).json({
      success: true,
      data: newQuestion
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getQuestions = async (req, res) => {
  try {
    const { classNo, language, chapter } = req.query;
    const pagination = new PaginationParams(req);
    
    let filter = {};
    if (classNo) filter.classNo = parseInt(classNo);
    if (language) filter.language = language;
    if (chapter) filter.chapter = chapter;

    const result = await paginate(
      Question,
      filter,
      pagination
    );

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      chapter,
      classNo,
      correctAnswer,
      options,
      question,
      language
    } = req.body;

    let parsedOptions = options;
    if (typeof options === "string") {
      try {
        parsedOptions = JSON.parse(options);
      } catch (e) {}
    }

    const updateData = {
      chapter,
      classNo: classNo ? parseInt(classNo) : undefined,
      correctAnswer,
      options: parsedOptions,
      question,
      language
    };

    // Remove undefined fields
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    // Handle diagram update
    if (req.file) {
      const uploadResult = await uploadOnCloudinary(req.file.path);
      if (uploadResult?.secure_url) {
        updateData.diagram = uploadResult.secure_url;
      }
    }

    const updated = await Question.findByIdAndUpdate(id, updateData, { new: true });
    if (!updated) return res.status(404).json({ success: false, message: "Question not found" });

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Question.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ success: false, message: "Question not found" });
    res.json({ success: true, message: "Question deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { addQuestion, getQuestions, updateQuestion, deleteQuestion };
