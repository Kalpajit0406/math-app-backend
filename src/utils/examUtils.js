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

    // Convert IST start numbers to UTC date
    const localUTC = Date.UTC(year, month, day, hour, minute);
    const startTime = new Date(localUTC - (5.5 * 60 * 60 * 1000));
    return new Date(startTime.getTime() + (exam.duration || 0) * 60 * 1000);
  } catch (e) {
    console.error('Error calculating exam end time:', e);
    return null;
  }
}

async function evaluateAttemptIfNeeded(attempt, exam) {
  if (!attempt.endTime || !attempt.responses || attempt.responses.length === 0) {
    return attempt;
  }
  
  const hasNullResponse = attempt.responses.some(r => r.isCorrect === null);
  if (!hasNullResponse) {
    return attempt;
  }

  // Check if exam has ended
  const endTime = getExamEndTime(exam);
  const now = new Date();
  const isExamEnded = endTime ? (now >= endTime) : true;

  if (isExamEnded) {
    let score = 0;
    for (const res of attempt.responses) {
      const question = (exam.questions && typeof exam.questions.id === 'function')
        ? exam.questions.id(res.questionId)
        : (exam.questions ? exam.questions.find(q => q._id && res.questionId && q._id.toString() === res.questionId.toString()) : null);
      if (question) {
        res.isCorrect = evaluateQuestionCorrectness(question, res.userAnswer);
        if (res.isCorrect) score++;
      } else {
        res.isCorrect = false;
      }
    }
    attempt.score = score;
    attempt.markModified('responses');
    await attempt.save();
  }
  return attempt;
}

module.exports = {
  evaluateQuestionCorrectness,
  getExamEndTime,
  evaluateAttemptIfNeeded,
};
