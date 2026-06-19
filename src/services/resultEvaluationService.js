const { evaluateQuestionCorrectness } = require('../utils/examUtils');

class ResultEvaluationService {
  /**
   * Helper to check if a user answer is attempted.
   */
  static isAttempted(userAnswer) {
    if (userAnswer === undefined || userAnswer === null) return false;
    const clean = String(userAnswer).trim();
    return clean.length > 0 && clean.toLowerCase() !== 'null';
  }

  /**
   * Evaluate a student test attempt and return canonical scoring metrics.
   * 
   * @param {number} totalQuestions 
   * @param {Array} submittedAnswers - Array of { questionId, userAnswer }
   * @param {Array} answerKey - Array of question objects containing { _id, correctAnswer, options }
   * @param {number} marksPerQuestion 
   * @param {number} negativeMarks 
   * @param {object} testConfig 
   */
  static evaluate(
    totalQuestions,
    submittedAnswers = [],
    answerKey = [],
    marksPerQuestion = 1.0,
    negativeMarks = 0.0,
    testConfig = {}
  ) {
    // Norm values
    const totalQ = Number(totalQuestions) || 0;
    const marksPerQ = Number(marksPerQuestion) || 1.0;
    const negMarks = Number(negativeMarks) || 0.0;

    // Convert answerKey list to a map for easy lookup
    const questionsMap = new Map();
    if (Array.isArray(answerKey)) {
      answerKey.forEach(q => {
        if (q && q._id) {
          questionsMap.set(String(q._id), q);
        } else if (q && q.id) {
          questionsMap.set(String(q.id), q);
        }
      });
    }

    let attemptedQuestions = 0;
    let correctQuestions = 0;

    // We also want to compute status per question in the list
    const perQuestionEvaluation = [];

    // Process all questions in the test (using answerKey if questions are there)
    const allQuestions = Array.isArray(answerKey) ? answerKey : [];
    
    // Create a map of submitted responses for fast lookup
    const responsesMap = new Map();
    submittedAnswers.forEach(resp => {
      if (resp && resp.questionId) {
        responsesMap.set(String(resp.questionId), resp.userAnswer);
      }
    });

    allQuestions.forEach(q => {
      const qIdStr = String(q._id || q.id);
      const userAnswer = responsesMap.has(qIdStr) ? responsesMap.get(qIdStr) : null;
      const attempted = this.isAttempted(userAnswer);

      let status = 'UNATTEMPTED';
      let isCorrect = null;

      if (attempted) {
        attemptedQuestions++;
        const correct = evaluateQuestionCorrectness(q, userAnswer);
        if (correct) {
          correctQuestions++;
          status = 'CORRECT';
          isCorrect = true;
        } else {
          status = 'INCORRECT';
          isCorrect = false;
        }
      }

      perQuestionEvaluation.push({
        questionId: qIdStr,
        status,
        userAnswer: userAnswer || '',
        correctAnswer: q.correctAnswer || '',
        isCorrect
      });
    });

    const unattemptedQuestions = Math.max(0, totalQ - attemptedQuestions);
    const incorrectQuestions = Math.max(0, attemptedQuestions - correctQuestions);

    // Calculate marks
    const maxMarks = totalQ * marksPerQ;
    const marksObtained = (correctQuestions * marksPerQ) - (incorrectQuestions * negMarks);

    // Percentages (rounded to 1 decimal place)
    const accuracyPercent = totalQ > 0
      ? parseFloat(((correctQuestions / totalQ) * 100).toFixed(1))
      : 0.0;

    const attemptedAccuracyPercent = attemptedQuestions > 0
      ? parseFloat(((correctQuestions / attemptedQuestions) * 100).toFixed(1))
      : 0.0;

    const attemptRatePercent = totalQ > 0
      ? parseFloat(((attemptedQuestions / totalQ) * 100).toFixed(1))
      : 0.0;

    return {
      totalQuestions: totalQ,
      attemptedQuestions,
      unattemptedQuestions,
      correctQuestions,
      incorrectQuestions,
      marksObtained: parseFloat(marksObtained.toFixed(2)),
      maxMarks: parseFloat(maxMarks.toFixed(2)),
      accuracyPercent,
      attemptedAccuracyPercent,
      attemptRatePercent,
      questions: perQuestionEvaluation
    };
  }
}

module.exports = ResultEvaluationService;
