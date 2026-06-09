const Attempt = require('../models/attemptModel');
const Question = require('../models/questionModel');
const QuestionRating = require('../models/questionRatingModel');
const StudentPerformance = require('../models/studentPerformanceModel');
const { getExamEndTime, evaluateAttemptIfNeeded } = require('../utils/examUtils');

class PerformanceAnalytics {
  // Get comprehensive student performance data
  static async getStudentPerformance(studentId, timeframe = 'week') {
    try {
      const Student = require('../models/studentModel');
      const student = await Student.findById(studentId);
      if (!student || !student.studentPhone) {
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

      const perf = await StudentPerformance.findOne({ studentId: student._id });
      if (!perf || !perf.testHistory || perf.testHistory.length === 0) {
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

      // Filter by timeframe
      let dateCutoff = 0;
      const now = Date.now();
      if (timeframe === 'today' || timeframe === 'day') {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        dateCutoff = startOfDay.getTime();
      } else if (timeframe === 'month') {
        dateCutoff = now - 30 * 24 * 60 * 60 * 1000;
      } else {
        // week (7 days)
        dateCutoff = now - 7 * 24 * 60 * 60 * 1000;
      }

      const filteredHistory = perf.testHistory.filter(h => new Date(h.takenAt).getTime() >= dateCutoff);

      const totalAttempts = filteredHistory.length;
      const completedAttempts = totalAttempts;
      const completionRate = totalAttempts > 0 ? 100.0 : 0.0;
      
      const totalQuestionsAnswered = filteredHistory.reduce((sum, h) => sum + h.totalQuestions, 0);
      const totalCorrect = filteredHistory.reduce((sum, h) => sum + h.score, 0);
      const accuracyRate = totalQuestionsAnswered > 0
        ? parseFloat(((totalCorrect / totalQuestionsAnswered) * 100).toFixed(1))
        : 0.0;

      const sumPercentage = filteredHistory.reduce((sum, h) => sum + h.percentage, 0);
      const averageScore = totalAttempts > 0
        ? parseFloat((sumPercentage / totalAttempts).toFixed(2))
        : 0.0;

      const improvementTrend = PerformanceAnalytics.calculateTrendFromHistory(filteredHistory) || 0.0;

      const performanceByChapter = {};

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
        recentAttempts: filteredHistory.slice(-5).map(h => ({
          examId: h.testId,
          examTitle: h.testType === 'self-assessment' ? 'Self Assessment' : 'Exam',
          score: h.score,
          maxScore: h.totalQuestions,
          date: h.takenAt ? new Date(h.takenAt).toLocaleDateString() : '',
        })),
        lastTestPercentage: perf.lastTestPercentage,
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
            item => item && item._id && response.questionId && item._id.toString() === response.questionId.toString()
          );
          if (q && q.chapter) {
            chapter = q.chapter;
          }
        }
        
        // Fallback to checking the global Question collection just in case
        if (chapter === 'General') {
          const question = response.questionId ? await Question.findById(response.questionId).lean() : null;
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
      const { getClassIdFromNo } = require('../utils/classCache');
      const classId = getClassIdFromNo(classNo);
      let query = { classId };
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

  static calculateTrendFromHistory(history) {
    if (!history || history.length < 5) return 0.0;
    const first5 = history.slice(0, Math.min(5, Math.floor(history.length / 2)));
    const last5 = history.slice(-5);

    const first5Avg = first5.reduce((sum, h) => sum + h.percentage, 0) / first5.length;
    const last5Avg = last5.reduce((sum, h) => sum + h.percentage, 0) / last5.length;

    if (first5Avg === 0) return last5Avg > 0 ? 100.0 : 0.0;
    return parseFloat(((last5Avg - first5Avg) / first5Avg * 100).toFixed(1));
  }

  static async savePerformance(studentMobileOrId, testId, testType, score, totalQuestions) {
    if (!studentMobileOrId) return null;
    try {
      const Student = require('../models/studentModel');
      let studentId = studentMobileOrId;
      
      const mongoose = require('mongoose');
      if (!mongoose.Types.ObjectId.isValid(studentMobileOrId)) {
        const student = await Student.findOne({ studentPhone: studentMobileOrId }).select('_id');
        if (!student) {
          console.error(`[PerformanceAnalytics] Student not found for phone: ${studentMobileOrId}`);
          return null;
        }
        studentId = student._id;
      }

      const percentage = totalQuestions > 0 ? parseFloat(((score / totalQuestions) * 100).toFixed(1)) : 0.0;
      
      let perf = await StudentPerformance.findOne({ studentId });
      if (!perf) {
        perf = new StudentPerformance({ studentId });
      }

      const exists = perf.testHistory.some(h => String(h.testId) === String(testId));
      if (!exists) {
        perf.lastTestPercentage = percentage;
        perf.testHistory.push({
          testId,
          testType,
          score,
          totalQuestions,
          percentage,
          takenAt: new Date()
        });

        // Recalculate totals and average
        perf.totalTestsTaken = perf.testHistory.length;
        const sumPercentage = perf.testHistory.reduce((sum, h) => sum + h.percentage, 0);
        perf.averagePercentage = parseFloat((sumPercentage / perf.totalTestsTaken).toFixed(1));

        await perf.save();
        console.log(`[PerformanceAnalytics] Saved performance for student ID: ${studentId}. Last %: ${percentage}%`);
      }
      await perf.populate('studentId');
      return perf;
    } catch (err) {
      console.error('[PerformanceAnalytics] Error saving performance:', err.message);
      return null;
    }
  }
}

module.exports = PerformanceAnalytics;
