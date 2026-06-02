/**
 * Student Performance Analytics Service
 * Tracks student progress, accuracy, and learning patterns
 */

const Attempt = require('../models/attemptModel');
const Question = require('../models/questionModel');
const QuestionRating = require('../models/questionRatingModel');

class PerformanceAnalytics {
  // Get comprehensive student performance data
  static async getStudentPerformance(studentId, timeframe = 'week') {
    try {
      // 1. Auto-delete student data older than 1 month
      const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await Attempt.deleteMany({ userId: studentId, createdAt: { $lt: oneMonthAgo } });
      
      const Student = require('../models/studentModel');
      const student = await Student.findById(studentId);
      if (student && student.studentMobile) {
        const TestResponse = require('../models/testResponseModel');
        await TestResponse.deleteMany({ studentMobile: student.studentMobile, createdAt: { $lt: oneMonthAgo } });
      }

      // 2. Calculate date filter based on timeframe query parameter
      let dateFilter = {};
      const now = new Date();
      if (timeframe === 'today' || timeframe === 'day') {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        dateFilter = { createdAt: { $gte: startOfDay } };
      } else if (timeframe === 'month') {
        dateFilter = { createdAt: { $gte: oneMonthAgo } };
      } else {
        // Default to past week (7 days)
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        dateFilter = { createdAt: { $gte: oneWeekAgo } };
      }

      const attempts = await Attempt.find({ 
        userId: studentId,
        ...dateFilter
      })
        .populate('examId', 'title duration questions chapters classNo totalQuestions marksPerQuestion')
        .lean();

      if (attempts.length === 0) {
        return {
          studentId,
          totalAttempts: 0,
          completedAttempts: 0,
          completionRate: 0.0,
          averageScore: 0.0,
          totalQuestionsAnswered: 0,
          accuracyRate: 0.0,
          improvementTrend: 0.0,
          performanceByChapter: {},
          recentAttempts: [],
        };
      }

      const totalAttempts = attempts.length;
      const completedAttempts = attempts.filter(a => a.endTime).length;
      const completionRate = totalAttempts > 0 ? parseFloat(((completedAttempts / totalAttempts) * 100).toFixed(1)) : 0.0;
      const totalScore = attempts.reduce((sum, a) => sum + (a.score || 0), 0);
      const averageScore = completedAttempts > 0 ? parseFloat((totalScore / completedAttempts).toFixed(2)) : 0.0;

      // Calculate accuracy rate from actual attempts instead of QuestionRating
      let totalQuestionsAnswered = 0;
      let totalCorrectAnswers = 0;
      for (const attempt of attempts) {
        if (attempt.responses) {
          totalQuestionsAnswered += attempt.responses.length;
          totalCorrectAnswers += attempt.responses.filter(r => r.isCorrect).length;
        }
      }
      const accuracyRate = totalQuestionsAnswered > 0
        ? parseFloat(((totalCorrectAnswers / totalQuestionsAnswered) * 100).toFixed(1))
        : 0.0;

      // Calculate improvement trend (score difference between first and last 5 attempts)
      const sortedByDate = attempts.sort((a, b) => 
        new Date(a.createdAt) - new Date(b.createdAt)
      );
      const improvementTrend = PerformanceAnalytics.calculateTrend(sortedByDate) || 0.0;

      // Performance by chapter
      const performanceByChapter = await PerformanceAnalytics.getPerformanceByChapter(
        studentId,
        attempts
      );

      return {
        studentId,
        totalAttempts,
        completedAttempts,
        completionRate,
        averageScore,
        totalQuestionsAnswered,
        accuracyRate,
        improvementTrend,
        performanceByChapter,
        recentAttempts: sortedByDate.slice(-5).map(a => {
          const maxQ = a.examId?.questions?.length || a.examId?.totalQuestions || 0;
          const marks = a.examId?.marksPerQuestion || 1.0;
          return {
            examId: a.examId?._id || a.examId,
            examTitle: a.examId?.title || 'Test',
            score: a.score || 0,
            maxScore: maxQ * marks,
            date: a.createdAt ? new Date(a.createdAt).toLocaleDateString() : '',
          };
        }),
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

    if (first5Avg === 0) return last5Avg > 0 ? 100.0 : 0.0;
    const trend = ((last5Avg - first5Avg) / first5Avg * 100).toFixed(1);
    return parseFloat(trend);
  }

  // Get performance breakdown by chapter
  static async getPerformanceByChapter(studentId, attempts) {
    const performanceByChapter = {};

    for (const attempt of attempts) {
      if (!attempt.examId || !attempt.responses) continue;

      for (const response of attempt.responses) {
        let chapter = 'General';
        
        // Find chapter from populated examId.questions subdocuments
        if (attempt.examId.questions) {
          const q = attempt.examId.questions.find(
            item => item._id.toString() === response.questionId.toString()
          );
          if (q && q.chapter) {
            chapter = q.chapter;
          }
        }
        
        // Fallback to checking the global Question collection just in case
        if (chapter === 'General') {
          const question = await Question.findById(response.questionId).lean();
          if (question && question.chapter) {
            chapter = question.chapter;
          } else if (attempt.examId.chapters && attempt.examId.chapters.length > 0) {
            chapter = attempt.examId.chapters[0];
          } else if (attempt.examId.title) {
            chapter = attempt.examId.title;
          }
        }

        if (!performanceByChapter[chapter]) {
          performanceByChapter[chapter] = {
            attempts: 0,
            attempted: 0,
            correct: 0,
            accuracy: 0.0,
          };
        }

        performanceByChapter[chapter].attempts++;
        performanceByChapter[chapter].attempted++;
        if (response.isCorrect) {
          performanceByChapter[chapter].correct++;
        }
        performanceByChapter[chapter].accuracy = parseFloat((
          (performanceByChapter[chapter].correct / performanceByChapter[chapter].attempts) * 100
        ).toFixed(1));
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
