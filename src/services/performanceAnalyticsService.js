/**
 * Student Performance Analytics Service
 * Tracks student progress, accuracy, and learning patterns
 */

const Attempt = require('../models/attemptModel');
const Question = require('../models/questionModel');
const QuestionRating = require('../models/questionRatingModel');

class PerformanceAnalytics {
  // Get comprehensive student performance data
  static async getStudentPerformance(studentId) {
    try {
      const attempts = await Attempt.find({ userId: studentId })
        .populate('examId', 'title duration')
        .lean();

      if (attempts.length === 0) {
        return {
          studentId,
          totalAttempts: 0,
          averageScore: 0,
          totalQuestionsAnswered: 0,
          accuracyRate: 0,
          improvementTrend: null,
          performanceByChapter: {},
        };
      }

      const totalAttempts = attempts.length;
      const completedAttempts = attempts.filter(a => a.endTime).length;
      const totalScore = attempts.reduce((sum, a) => sum + (a.score || 0), 0);
      const averageScore = (totalScore / completedAttempts).toFixed(2);

      // Calculate accuracy rate
      const ratings = await QuestionRating.find({ userId: studentId }).lean();
      const accuracyRate = ratings.length > 0
        ? ((ratings.filter(r => r.isCorrectAnswer).length / ratings.length) * 100).toFixed(1)
        : 0;

      // Get questions answered
      let totalQuestionsAnswered = 0;
      for (const attempt of attempts) {
        if (attempt.responses) {
          totalQuestionsAnswered += attempt.responses.length;
        }
      }

      // Calculate improvement trend (score difference between first and last 5 attempts)
      const sortedByDate = attempts.sort((a, b) => 
        new Date(a.createdAt) - new Date(b.createdAt)
      );
      const improvementTrend = PerformanceAnalytics.calculateTrend(sortedByDate);

      // Performance by chapter
      const performanceByChapter = await PerformanceAnalytics.getPerformanceByChapter(
        studentId,
        attempts
      );

      return {
        studentId,
        totalAttempts,
        completedAttempts,
        averageScore: parseFloat(averageScore),
        totalQuestionsAnswered,
        accuracyRate: parseFloat(accuracyRate),
        improvementTrend,
        performanceByChapter,
        recentAttempts: sortedByDate.slice(-5).map(a => ({
          examId: a.examId,
          score: a.score,
          date: a.createdAt,
        })),
      };
    } catch (error) {
      console.error('Error calculating student performance:', error);
      throw error;
    }
  }

  // Calculate trend: negative = declining, 0 = stable, positive = improving
  static calculateTrend(attempts) {
    if (attempts.length < 5) return null;

    const first5 = attempts.slice(0, Math.min(5, Math.floor(attempts.length / 2)));
    const last5 = attempts.slice(-5);

    const first5Avg = first5.reduce((sum, a) => sum + (a.score || 0), 0) / first5.length;
    const last5Avg = last5.reduce((sum, a) => sum + (a.score || 0), 0) / last5.length;

    const trend = ((last5Avg - first5Avg) / first5Avg * 100).toFixed(1);
    return parseFloat(trend);
  }

  // Get performance breakdown by chapter
  static async getPerformanceByChapter(studentId, attempts) {
    const performanceByChapter = {};

    for (const attempt of attempts) {
      if (!attempt.examId || !attempt.responses) continue;

      for (const response of attempt.responses) {
        const question = await Question.findById(response.questionId).lean();
        if (!question) continue;

        const chapter = question.chapter;
        if (!performanceByChapter[chapter]) {
          performanceByChapter[chapter] = {
            attempted: 0,
            correct: 0,
            accuracy: 0,
          };
        }

        performanceByChapter[chapter].attempted++;
        if (response.selectedAnswer === question.correctAnswer) {
          performanceByChapter[chapter].correct++;
        }
        performanceByChapter[chapter].accuracy = (
          (performanceByChapter[chapter].correct / performanceByChapter[chapter].attempted) * 100
        ).toFixed(1);
      }
    }

    return performanceByChapter;
  }

  // Get class/batch analytics for teachers
  static async getClassPerformance(classNo, language = null) {
    try {
      let query = { classNo };
      if (language) query.language = language;

      const students = await require('../models/studentModel').find(query).lean();
      const studentIds = students.map(s => s._id);

      const attempts = await Attempt.find({ userId: { $in: studentIds } })
        .populate('userId', 'firstName lastName')
        .lean();

      if (attempts.length === 0) {
        return {
          classNo,
          totalStudents: students.length,
          activeStudents: 0,
          classAverageScore: 0,
          classAverageAccuracy: 0,
          topPerformers: [],
          needsAttention: [],
        };
      }

      // Calculate class metrics
      const completedAttempts = attempts.filter(a => a.endTime);
      const classAverageScore = (
        completedAttempts.reduce((sum, a) => sum + (a.score || 0), 0) / completedAttempts.length
      ).toFixed(2);

      // Find top performers and those needing attention
      const studentStats = {};
      for (const attempt of completedAttempts) {
        if (!studentStats[attempt.userId]) {
          studentStats[attempt.userId] = {
            totalAttempts: 0,
            totalScore: 0,
            userData: attempt.userId,
          };
        }
        studentStats[attempt.userId].totalAttempts++;
        studentStats[attempt.userId].totalScore += attempt.score || 0;
      }

      const studentPerformance = Object.entries(studentStats)
        .map(([_, stats]) => ({
          averageScore: (stats.totalScore / stats.totalAttempts).toFixed(2),
          totalAttempts: stats.totalAttempts,
        }))
        .sort((a, b) => b.averageScore - a.averageScore);

      const topPerformers = studentPerformance.slice(0, 5);
      const needsAttention = studentPerformance.slice(-5).reverse();

      return {
        classNo,
        totalStudents: students.length,
        activeStudents: new Set(attempts.map(a => a.userId)).size,
        classAverageScore: parseFloat(classAverageScore),
        topPerformers,
        needsAttention,
      };
    } catch (error) {
      console.error('Error calculating class performance:', error);
      throw error;
    }
  }
}

module.exports = PerformanceAnalytics;
