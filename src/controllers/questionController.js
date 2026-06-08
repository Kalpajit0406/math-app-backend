const Question = require('../models/questionModel');
const { uploadOnCloudinary } = require('../utils/cloudinary');
const path = require('path');
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
      } else {
        const filename = path.basename(req.file.path);
        diagramUrl = `/public/temp/${filename}`;
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
    const { classNo, language, chapter, search } = req.query;
    const pagination = new PaginationParams(req);
    
    let filter = {};
    if (classNo) filter.classNo = parseInt(classNo);
    if (language) {
      if (language.toLowerCase() === 'both') {
        filter.language = { $in: ['Bengali', 'English', 'Both'] };
      } else {
        filter.language = { $in: [new RegExp(`^${language}$`, 'i'), 'Both'] };
      }
    }
    if (chapter) {
      const mongoose = require('mongoose');
      const Chapter = mongoose.model('Chapter');
      const { normalizeChapterName } = require('../utils/chapterNormalization');
      const normalized = normalizeChapterName(chapter);
      
      const query = { normalizedChapterName: normalized };
      if (filter.classNo) query.classId = filter.classNo;
      
      const chaps = await Chapter.find(query).select('_id');
      if (chaps.length > 0) {
        filter.chapterId = { $in: chaps.map(c => c._id) };
      } else {
        filter.chapterId = new mongoose.Types.ObjectId();
      }
    }
    if (search && search.trim() !== '') {
      filter.question = { $regex: search.trim(), $options: 'i' };
    }

    const result = await paginate(
      Question,
      filter,
      pagination
    );

    const sanitizedData = result.data.map(q => {
      const qObj = { ...q };
      qObj.id = qObj._id;
      if (qObj.chapterId) {
        qObj.chapter = qObj.chapterId.chapterName || '';
      } else {
        qObj.chapter = qObj.chapter || '';
      }
      qObj.questionText = qObj.questionText || qObj.question || '';
      qObj.type = qObj.type || ((qObj.options && qObj.options.length > 0) ? 'mcq' : 'numeric');
      return qObj;
    });

    res.json({
      success: true,
      data: sanitizedData,
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
      language,
      diagram
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

    if (question) {
      const { normalizeQuestion, generateHash } = require('../services/questionDuplicateDetector');
      const normalized = normalizeQuestion(question);
      updateData.questionHash = generateHash(normalized);
    }

    // Remove undefined fields
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    if (diagram !== undefined) {
      if (diagram === 'null' || diagram === '' || diagram === null) {
        updateData.diagram = null;
      }
    }

    // Handle diagram update
    if (req.file) {
      const uploadResult = await uploadOnCloudinary(req.file.path);
      if (uploadResult?.secure_url) {
        updateData.diagram = uploadResult.secure_url;
      } else {
        const filename = path.basename(req.file.path);
        updateData.diagram = `/public/temp/${filename}`;
      }
    }

    const updated = await Question.findByIdAndUpdate(id, updateData, { returnDocument: 'after' });
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

const getFilteredQuestions = async (req, res) => {
  try {
    const { classNo, language } = req.params;
    const filter = {};
    if (classNo) filter.classNo = parseInt(classNo);
    if (language) {
      if (language.toLowerCase() === 'both') {
        filter.language = { $in: ['Bengali', 'English', 'Both'] };
      } else {
        filter.language = { $in: [new RegExp(`^${language}$`, 'i'), 'Both'] };
      }
    }
    
    const questions = await Question.find(filter);
    res.status(200).json({
      success: true,
      count: questions.length,
      data: questions,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { addQuestion, getQuestions, updateQuestion, deleteQuestion, getFilteredQuestions };
