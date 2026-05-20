/**
 * Question Rating Controller
 * Handles question difficulty ratings and feedback
 */

const QuestionRating = require('../models/questionRatingModel');
const Question = require('../models/questionModel');

// Rate a question after answering
exports.rateQuestion = async (req, res) => {
  try {
    const { questionId, difficulty, clarity, comment, isCorrectAnswer, timeSpent } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!questionId || !difficulty) {
      return res.status(400).json({
        success: false,
        message: 'questionId and difficulty are required'
      });
    }

    if (difficulty < 1 || difficulty > 5) {
      return res.status(400).json({
        success: false,
        message: 'Difficulty must be between 1 and 5'
      });
    }

    // Verify question exists
    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ success: false, message: 'Question not found' });
    }

    // Update or create rating
    const rating = await QuestionRating.findOneAndUpdate(
      { questionId, userId },
      {
        difficulty,
        clarity,
        comment,
        isCorrectAnswer,
        timeSpent,
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: 'Question rated successfully',
      data: rating
    });
  } catch (error) {
    console.error('Rate question error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get question analytics (average difficulty, clarity, success rate)
exports.getQuestionAnalytics = async (req, res) => {
  try {
    const { questionId } = req.params;

    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ success: false, message: 'Question not found' });
    }

    const ratings = await QuestionRating.find({ questionId });

    if (ratings.length === 0) {
      return res.json({
        success: true,
        data: {
          questionId,
          totalRatings: 0,
          averageDifficulty: null,
          averageClarity: null,
          successRate: null,
          averageTimeSpent: null,
        }
      });
    }

    const totalRatings = ratings.length;
    const averageDifficulty = (
      ratings.reduce((sum, r) => sum + r.difficulty, 0) / totalRatings
    ).toFixed(2);
    
    const clarityRatings = ratings.filter(r => r.clarity);
    const averageClarity = clarityRatings.length > 0
      ? (clarityRatings.reduce((sum, r) => sum + r.clarity, 0) / clarityRatings.length).toFixed(2)
      : null;

    const successfulAttempts = ratings.filter(r => r.isCorrectAnswer).length;
    const successRate = ((successfulAttempts / totalRatings) * 100).toFixed(1);

    const timeSpentRatings = ratings.filter(r => r.timeSpent);
    const averageTimeSpent = timeSpentRatings.length > 0
      ? Math.round(timeSpentRatings.reduce((sum, r) => sum + r.timeSpent, 0) / timeSpentRatings.length)
      : null;

    res.json({
      success: true,
      data: {
        questionId,
        totalRatings,
        averageDifficulty: parseFloat(averageDifficulty),
        averageClarity: averageClarity ? parseFloat(averageClarity) : null,
        successRate: parseFloat(successRate),
        averageTimeSpent,
        difficultyDistribution: getDifficultyDistribution(ratings),
      }
    });
  } catch (error) {
    console.error('Get question analytics error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get analytics for multiple questions in an exam
exports.getExamQuestionsAnalytics = async (req, res) => {
  try {
    const { examId } = req.params;
    const { Exam } = require('../models/examModel');

    const exam = await Exam.findById(examId).lean();
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    const questionIds = exam.questions.map(q => q.questionId || q);
    
    const analyticsPromises = questionIds.map(async (qId) => {
      const ratings = await QuestionRating.find({ questionId: qId });
      if (ratings.length === 0) return null;

      const totalRatings = ratings.length;
      return {
        questionId: qId,
        totalRatings,
        averageDifficulty: (
          ratings.reduce((sum, r) => sum + r.difficulty, 0) / totalRatings
        ).toFixed(2),
        successRate: (
          (ratings.filter(r => r.isCorrectAnswer).length / totalRatings) * 100
        ).toFixed(1),
      };
    });

    const analytics = (await Promise.all(analyticsPromises)).filter(a => a);

    res.json({
      success: true,
      examId,
      totalQuestions: questionIds.length,
      analysedQuestions: analytics.length,
      data: analytics
    });
  } catch (error) {
    console.error('Get exam analytics error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Helper: Get difficulty distribution
function getDifficultyDistribution(ratings) {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const rating of ratings) {
    distribution[rating.difficulty]++;
  }
  return distribution;
}

module.exports = {
  rateQuestion: exports.rateQuestion,
  getQuestionAnalytics: exports.getQuestionAnalytics,
  getExamQuestionsAnalytics: exports.getExamQuestionsAnalytics,
};
