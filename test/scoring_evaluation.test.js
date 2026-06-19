/**
 * Scoring and Evaluation System Test Suite
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ResultEvaluationService = require('../src/services/resultEvaluationService');

test('ResultEvaluationService Canonical Formulas Test', async (t) => {
  await t.test('Verify accuracy and attempt metrics with 10 questions, 7 attempted, 1 correct', () => {
    const totalQuestions = 10;
    
    // Create 10 mock questions
    const answerKey = [];
    for (let i = 1; i <= 10; i++) {
      answerKey.push({
        _id: String(i),
        correctAnswer: 'A',
        options: ['Option A', 'Option B', 'Option C', 'Option D']
      });
    }

    // Create 7 submitted answers (1 correct, 6 incorrect)
    const submittedAnswers = [
      { questionId: '1', userAnswer: 'A' }, // Correct
      { questionId: '2', userAnswer: 'B' }, // Incorrect
      { questionId: '3', userAnswer: 'B' }, // Incorrect
      { questionId: '4', userAnswer: 'B' }, // Incorrect
      { questionId: '5', userAnswer: 'B' }, // Incorrect
      { questionId: '6', userAnswer: 'B' }, // Incorrect
      { questionId: '7', userAnswer: 'B' }, // Incorrect
      // 3 unattempted (missing from submittedAnswers array)
    ];

    const result = ResultEvaluationService.evaluate(
      totalQuestions,
      submittedAnswers,
      answerKey,
      1.0, // marksPerQuestion
      0.0  // negativeMarks
    );

    // Assert counts
    assert.equal(result.totalQuestions, 10, 'Total questions should be 10');
    assert.equal(result.attemptedQuestions, 7, 'Attempted questions should be 7');
    assert.equal(result.unattemptedQuestions, 3, 'Unattempted questions should be 3');
    assert.equal(result.correctQuestions, 1, 'Correct questions should be 1');
    assert.equal(result.incorrectQuestions, 6, 'Incorrect questions should be 6');

    // Assert percentages
    assert.equal(result.accuracyPercent, 10.0, 'Accuracy percent should be 10.0%');
    assert.equal(result.attemptedAccuracyPercent, 14.3, 'Attempted accuracy percent should be 14.3%');
    assert.equal(result.attemptRatePercent, 70.0, 'Attempt rate percent should be 70.0%');

    // Assert marks
    assert.equal(result.marksObtained, 1.0, 'Marks obtained should be 1.0');
    assert.equal(result.maxMarks, 10.0, 'Max marks should be 10.0');

    // Verify per-question statuses
    assert.equal(result.questions[0].status, 'CORRECT');
    assert.equal(result.questions[0].isCorrect, true);

    for (let i = 1; i < 7; i++) {
      assert.equal(result.questions[i].status, 'INCORRECT');
      assert.equal(result.questions[i].isCorrect, false);
    }

    for (let i = 7; i < 10; i++) {
      assert.equal(result.questions[i].status, 'UNATTEMPTED');
      assert.equal(result.questions[i].isCorrect, null);
    }
  });

  await t.test('Verify accuracy and attempt metrics with negative marking', () => {
    const totalQuestions = 5;
    
    // Create 5 mock questions
    const answerKey = [];
    for (let i = 1; i <= 5; i++) {
      answerKey.push({
        _id: String(i),
        correctAnswer: 'A',
        options: ['Option A', 'Option B', 'Option C', 'Option D']
      });
    }

    // Create 4 submitted answers (2 correct, 2 incorrect, 1 unattempted)
    const submittedAnswers = [
      { questionId: '1', userAnswer: 'A' }, // Correct
      { questionId: '2', userAnswer: 'A' }, // Correct
      { questionId: '3', userAnswer: 'B' }, // Incorrect
      { questionId: '4', userAnswer: 'C' }, // Incorrect
    ];

    const result = ResultEvaluationService.evaluate(
      totalQuestions,
      submittedAnswers,
      answerKey,
      4.0, // 4 marks per question
      1.0  // -1 negative mark per incorrect
    );

    // Correct: 2 * 4 = 8 marks
    // Incorrect: 2 * -1 = -2 marks
    // Expected Marks: 8 - 2 = 6 marks
    assert.equal(result.correctQuestions, 2);
    assert.equal(result.incorrectQuestions, 2);
    assert.equal(result.unattemptedQuestions, 1);
    assert.equal(result.marksObtained, 6.0);
    assert.equal(result.maxMarks, 20.0);
    assert.equal(result.accuracyPercent, 40.0); // 2/5 * 100
    assert.equal(result.attemptedAccuracyPercent, 50.0); // 2/4 * 100
    assert.equal(result.attemptRatePercent, 80.0); // 4/5 * 100
  });
});
