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

      // Auto-evaluate completed attempts that have ended but haven't been evaluated/saved yet.
      // Limit to 10 per request to avoid unbounded work on every analytics page load.
      const Exam = require('../models/examModel');
      const unevaluatedAttempts = await Attempt.find({
        userId: student._id,
        endTime: { $exists: true },
        'responses.isCorrect': null
      }).populate('examId').limit(10);

      for (const attempt of unevaluatedAttempts) {
        if (attempt.examId) {
          try {
            await evaluateAttemptIfNeeded(attempt, attempt.examId);
          } catch (err) {
            console.error(`Error auto-evaluating attempt ${attempt._id} in performance fetch:`, err.message);
          }
        }
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
      
      const sumPercentage = filteredHistory.reduce((sum, h) => sum + h.percentage, 0);
      const totalQuestionsAnswered = filteredHistory.reduce((sum, h) => sum + h.totalQuestions, 0);
      const accuracyRate = totalAttempts > 0
        ? parseFloat((sumPercentage / totalAttempts).toFixed(1))
        : 0.0;
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
          accuracyPercent: h.percentage,
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
  // NOTE: Avoids per-response Question.findById() calls (N*M DB queries).
  // Uses exam-level chapter metadata instead.
  static async getPerformanceByChapter(studentId, attempts) {
    const performanceByChapter = {};

    for (const attempt of attempts) {
      if (!attempt.examId || !attempt.responses) continue;

      // Build a questionId -> chapter map from embedded exam questions (no extra DB calls)
      const questionChapterMap = new Map();
      if (attempt.examId.questions && Array.isArray(attempt.examId.questions)) {
        for (const q of attempt.examId.questions) {
          if (q && q._id && q.chapter) {
            questionChapterMap.set(String(q._id), q.chapter);
          }
        }
      }

      const examChapterFallback =
        (attempt.examId.chapters && attempt.examId.chapters.length > 0)
          ? attempt.examId.chapters[0]
          : (attempt.examId.title || 'General');

      for (const response of attempt.responses) {
        const chapter =
          (response.questionId && questionChapterMap.get(String(response.questionId)))
          || examChapterFallback;

        if (!performanceByChapter[chapter]) {
          performanceByChapter[chapter] = { attempts: 0, attempted: 0, correct: 0, accuracy: 0.0 };
        }

        performanceByChapter[chapter].attempts++;
        performanceByChapter[chapter].attempted++;
        if (response.isCorrect) performanceByChapter[chapter].correct++;
        performanceByChapter[chapter].accuracy = parseFloat((
          (performanceByChapter[chapter].correct / performanceByChapter[chapter].attempts) * 100
        ).toFixed(1));
      }
    }

    return performanceByChapter;
  }

  // Get class/batch analytics for teachers.
  // Uses a single MongoDB aggregation pipeline instead of loading all attempts into JS
  // memory (previously O(N*M) where N=students, M=attempts per student).
  static async getClassPerformance(classNo, language = null) {
    try {
      const { getClassIdFromNo } = require('../utils/classCache');
      const classId = getClassIdFromNo(classNo);
      let query = { classId };
      if (language) query.language = language;

      const students = await require('../models/studentModel').find(query).select('_id firstName lastName').lean();
      const totalStudents = students.length;

      if (totalStudents === 0) {
        return {
          classNo, totalStudents: 0, activeStudents: 0,
          classAverageScore: 0, classAverageAccuracy: 0,
          topPerformers: [], needsAttention: []
        };
      }

      const studentIds = students.map(s => s._id);

      // Single aggregation: group by userId, compute averages server-side
      const pipeline = [
        {
          $match: {
            userId: { $in: studentIds },
            endTime: { $exists: true }
          }
        },
        {
          $lookup: {
            from: 'exams',
            localField: 'examId',
            foreignField: '_id',
            as: 'examInfo'
          }
        },
        {
          $unwind: {
            path: '$examInfo',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $project: {
            userId: 1,
            score: 1,
            percentage: {
              $cond: [
                { $gt: [{ $ifNull: ['$evaluationSummary.accuracyPercent', -1] }, -1] },
                '$evaluationSummary.accuracyPercent',
                {
                  $cond: [
                    {
                      $and: [
                        { $not: { $eq: [{ $ifNull: ['$examInfo', null] }, null] } },
                        { $isArray: '$examInfo.questions' },
                        { $gt: [{ $size: '$examInfo.questions' }, 0] }
                      ]
                    },
                    {
                      $multiply: [
                        { $divide: [{ $ifNull: ['$score', 0] }, { $size: '$examInfo.questions' }] },
                        100
                      ]
                    },
                    {
                      $cond: [
                        { $gt: [{ $size: { $ifNull: ['$responses', []] } }, 0] },
                        {
                          $multiply: [
                            { $divide: [{ $ifNull: ['$score', 0] }, { $size: '$responses' }] },
                            100
                          ]
                        },
                        0
                      ]
                    }
                  ]
                }
              ]
            }
          }
        },
        {
          $group: {
            _id: '$userId',
            totalAttempts: { $sum: 1 },
            averageScore: { $avg: '$percentage' }
          }
        },
        { $sort: { averageScore: -1 } }
      ];

      const studentStats = await Attempt.aggregate(pipeline);

      if (studentStats.length === 0) {
        return {
          classNo, totalStudents, activeStudents: 0,
          classAverageScore: 0, classAverageAccuracy: 0,
          topPerformers: [], needsAttention: []
        };
      }

      const activeStudents = studentStats.length;
      const classAverageScore = parseFloat(
        (studentStats.reduce((s, r) => s + r.averageScore, 0) / activeStudents).toFixed(2)
      );

      const studentNameMap = new Map();
      students.forEach(s => {
        const name = `${s.firstName || ''} ${s.lastName || ''}`.trim();
        studentNameMap.set(s._id.toString(), name);
      });

      const formatted = studentStats.map(r => ({
        studentId: r._id,
        name: studentNameMap.get(r._id.toString()) || 'N/A',
        averageScore: parseFloat(r.averageScore.toFixed(2)),
        totalAttempts: r.totalAttempts
      }));

      return {
        classNo,
        totalStudents,
        activeStudents,
        classAverageScore,
        topPerformers: formatted.slice(0, 5),
        needsAttention: formatted.slice(-5).reverse()
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
