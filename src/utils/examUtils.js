const evaluateQuestionCorrectness = (question, userAnswer) => {
  if (!question || userAnswer === undefined || userAnswer === null) return false;
  
  const qAns = String(question.correctAnswer).trim().toLowerCase();
  const uAns = String(userAnswer).trim().toLowerCase();
  
  if (qAns === uAns) return true;
  
  const options = question.options || [];
  const correctLetterIdx = ['a', 'b', 'c', 'd'].indexOf(qAns);
  const correctOptionText = correctLetterIdx !== -1 && correctLetterIdx < options.length 
    ? String(options[correctLetterIdx]).trim().toLowerCase() 
    : null;
  
  if (correctOptionText && correctOptionText === uAns) return true;
  
  const userLetterIdx = ['a', 'b', 'c', 'd'].indexOf(uAns);
  const userOptionText = userLetterIdx !== -1 && userLetterIdx < options.length 
    ? String(options[userLetterIdx]).trim().toLowerCase() 
    : null;
    
  if (userOptionText && qAns === userOptionText) return true;
  
  return false;
};

function getExamEndTime(exam) {
  try {
    if (!exam || !exam.date || !exam.time) return null;
    let cleanDate = exam.date.trim();
    let cleanTime = exam.time.trim();
    if (!cleanDate || !cleanTime) return null;

    let year = 0, month = 0, day = 0;
    if (cleanDate.includes('/')) {
      const parts = cleanDate.split('/');
      if (parts.length === 3) {
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
        year = parseInt(parts[2], 10);
      }
    } else if (cleanDate.includes('-')) {
      const parts = cleanDate.split('-');
      if (parts.length === 3) {
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
        day = parseInt(parts[2], 10);
      }
    } else {
      const parsed = new Date(cleanDate);
      if (isNaN(parsed.getTime())) return null;
      return new Date(parsed.getTime() + (exam.duration || 0) * 60 * 1000);
    }

    let hour = 0, minute = 0;
    const timeParts = cleanTime.split(':');
    if (timeParts.length >= 2) {
      hour = parseInt(timeParts[0], 10);
      const minPart = timeParts[1].replace(/[^0-9]/g, '');
      minute = parseInt(minPart, 10);

      const isPm = cleanTime.toLowerCase().includes('pm');
      const isAm = cleanTime.toLowerCase().includes('am');
      if (isPm && hour < 12) {
        hour += 12;
      } else if (isAm && hour === 12) {
        hour = 0;
      }
    }

    const localUTC = Date.UTC(year, month, day, hour, minute);
    const startTime = new Date(localUTC - (5.5 * 60 * 60 * 1000));
    return new Date(startTime.getTime() + (exam.duration || 0) * 60 * 1000);
  } catch (e) {
    console.error('Error calculating exam end time:', e);
    return null;
  }
}

function getExamStartTime(exam) {
  try {
    if (!exam || !exam.date || !exam.time) return null;
    let cleanDate = exam.date.trim();
    let cleanTime = exam.time.trim();
    if (!cleanDate || !cleanTime) return null;

    let year = 0, month = 0, day = 0;
    if (cleanDate.includes('/')) {
      const parts = cleanDate.split('/');
      if (parts.length === 3) {
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
        year = parseInt(parts[2], 10);
      }
    } else if (cleanDate.includes('-')) {
      const parts = cleanDate.split('-');
      if (parts.length === 3) {
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
        day = parseInt(parts[2], 10);
      }
    } else {
      const parsed = new Date(cleanDate);
      if (isNaN(parsed.getTime())) return null;
      return parsed;
    }

    let hour = 0, minute = 0;
    const timeParts = cleanTime.split(':');
    if (timeParts.length >= 2) {
      hour = parseInt(timeParts[0], 10);
      const minPart = timeParts[1].replace(/[^0-9]/g, '');
      minute = parseInt(minPart, 10);

      const isPm = cleanTime.toLowerCase().includes('pm');
      const isAm = cleanTime.toLowerCase().includes('am');
      if (isPm && hour < 12) {
        hour += 12;
      } else if (isAm && hour === 12) {
        hour = 0;
      }
    }

    // Convert IST start numbers to UTC date
    const localUTC = Date.UTC(year, month, day, hour, minute);
    return new Date(localUTC - (5.5 * 60 * 60 * 1000));
  } catch (e) {
    console.error('Error calculating exam start time:', e);
    return null;
  }
}

async function evaluateAttemptIfNeeded(attempt, exam) {
  if (!attempt.endTime || !attempt.responses || attempt.responses.length === 0) {
    return attempt;
  }
  
  const hasNullResponse = attempt.responses.some(r => r.isCorrect === null);
  if (!hasNullResponse && attempt.evaluationSummary) {
    return attempt;
  }

  // Check if exam has ended
  const endTime = getExamEndTime(exam);
  const now = new Date();
  const isExamEnded = endTime ? (now >= endTime) : true;

  if (isExamEnded) {
    const ResultEvaluationService = require('../services/resultEvaluationService');
    const summary = ResultEvaluationService.evaluate(
      exam.questions.length,
      attempt.responses,
      exam.questions,
      exam.marksPerQuestion || 1.0,
      exam.negativeMarking || 0.0
    );

    // Map evaluation status back to response array
    attempt.responses.forEach(res => {
      const evalQ = summary.questions.find(q => q.questionId === String(res.questionId));
      if (evalQ) {
        res.isCorrect = evalQ.isCorrect;
      }
    });

    attempt.score = summary.correctQuestions;
    attempt.marksObtained = summary.marksObtained;
    attempt.evaluationSummary = summary;
    attempt.markModified('responses');
    attempt.markModified('evaluationSummary');
    await attempt.save();

    // Save performance analytics after the exam has ended
    try {
      const Student = require('../models/studentModel');
      const student = await Student.findById(attempt.userId);
      if (student && student.studentPhone) {
        const PerformanceAnalytics = require('../services/performanceAnalyticsService');
        await PerformanceAnalytics.savePerformance(
          student.studentPhone,
          attempt._id.toString(),
          'exam',
          summary.correctQuestions,
          exam.questions.length
        );
      }
    } catch (err) {
      console.error('Error saving performance on evaluation:', err.message);
    }
  }
  return attempt;
}

module.exports = {
  evaluateQuestionCorrectness,
  getExamStartTime,
  getExamEndTime,
  evaluateAttemptIfNeeded,
};
