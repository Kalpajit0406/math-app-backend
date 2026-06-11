/**
 * OCR Pipeline Upgrade Test Suite
 * Validates the Phase 1 to Phase 12 upgrades to the MathsWithSD pipeline.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { 
  OCRPipeline, 
  isQuestionCandidate, 
  parseAnswerKeys 
} = require('../src/services/ocrPipeline');
const PdfController = require('../src/controllers/pdfController');
const { QuestionDuplicateDetector } = require('../src/services/questionDuplicateDetector');

test('Phase 1 & 6: Document Cleaning and Header/Footer Stripping', async (t) => {
  await t.test('strips page numbers, headers, footers, website URLs', () => {
    const rawPagesText = [
      "Prepared by Amit Bajaj\nPage 1\nwww.mathswithsd.com\nQ1. Solve x + 2 = 5",
      "Downloaded from website\nPage 2\nhttps://mathswithsd.com\nQ2. Solve y - 3 = 10\nFooter text block"
    ];

    const cleaned = PdfController.removeHeadersFootersAndRepeatedLines(rawPagesText);

    assert.ok(!cleaned[0].includes('Prepared by'), 'Should strip Prepared by');
    assert.ok(!cleaned[0].includes('Page 1'), 'Should strip Page 1');
    assert.ok(!cleaned[0].includes('www.mathswithsd.com'), 'Should strip website domain');
    assert.ok(cleaned[0].includes('Q1. Solve x + 2 = 5'), 'Should preserve actual question text');

    assert.ok(!cleaned[1].includes('Downloaded from'), 'Should strip Downloaded from');
    assert.ok(!cleaned[1].includes('Page 2'), 'Should strip Page 2');
    assert.ok(!cleaned[1].includes('https://'), 'Should strip https links');
  });

  await t.test('detects and strips repeated lines appearing across multiple pages (dynamic footers)', () => {
    const rawPagesText = [
      "Q1. Find limit\nSome dynamic footer content here\nSame common line on all pages",
      "Q2. Find derivative\nDifferent footer stuff\nSame common line on all pages",
      "Q3. Find integral\nOther stuff\nSame common line on all pages"
    ];

    const cleaned = PdfController.removeHeadersFootersAndRepeatedLines(rawPagesText);

    assert.ok(!cleaned[0].includes('Same common line on all pages'), 'Should strip lines repeating across pages');
    assert.ok(!cleaned[1].includes('Same common line on all pages'), 'Should strip lines repeating across pages');
    assert.ok(!cleaned[2].includes('Same common line on all pages'), 'Should strip lines repeating across pages');
    assert.ok(cleaned[0].includes('Q1. Find limit'), 'Should preserve unique question content');
  });
});

test('Phase 2: Question Candidate Filtering', async (t) => {
  await t.test('filters out chapter titles, exercises, and metadata blocks', () => {
    const badCandidates = [
      "CHAPTER – 9 DIFFERENTIAL EQUATIONS",
      "UNIT 3: CALCULUS",
      "EXERCISE 4.2",
      "MULTIPLE CHOICE QUESTIONS",
      "ANSWER KEY",
      "SOLUTIONS",
      "CONTENTS",
      "INDEX"
    ];

    for (const title of badCandidates) {
      assert.strictEqual(isQuestionCandidate(title), false, `Should reject: ${title}`);
    }
  });

  await t.test('allows valid mathematical question starts', () => {
    const goodCandidates = [
      "What is the value of dy/dx?",
      "Solve the differential equation",
      "Find the limit of x -> 0",
      "Calculate the determinant of the matrix"
    ];

    for (const text of goodCandidates) {
      assert.strictEqual(isQuestionCandidate(text), true, `Should accept: ${text}`);
    }
  });
});

test('Phase 4: Extraction Completeness Validation', async (t) => {
  await t.test('correctly counts expected question patterns', () => {
    const text = `
      Question 1. Solve x + 5 = 10.
      Q2. What is log(e)?
      3. Solve limit.
      Some other non-numbered text line.
      4) Solve matrix.
    `;
    const expected = PdfController.countExpectedQuestions(text);
    assert.strictEqual(expected, 4, 'Should identify all 4 expected questions');
  });

  await t.test('flags session as INCOMPLETE if actual < 90% of expected questions', () => {
    // Expected: 20, Extracted: 17 (85% - below 90%)
    const reportIncomplete = PdfController.generateQAReport({
      expectedQuestions: 20,
      extractedQuestions: 17,
      quarantinedQuestions: 0
    });

    assert.strictEqual(reportIncomplete.completenessStatus, 'INCOMPLETE');
    assert.ok(reportIncomplete.warningMessage.includes('Missing questions detected'), 'Should include warning message');

    // Expected: 20, Extracted: 19 (95% - above 90%)
    const reportComplete = PdfController.generateQAReport({
      expectedQuestions: 20,
      extractedQuestions: 19,
      quarantinedQuestions: 0
    });

    assert.strictEqual(reportComplete.completenessStatus, 'COMPLETE');
    assert.strictEqual(reportComplete.warningMessage, null, 'Should have no warning');
  });
});

test('Phase 5: Answer Key Ingestion & Mapping', async (t) => {
  await t.test('extracts answer key patterns correctly', () => {
    const text1 = "ANSWERS\n1.d\n2.a\n3.c\n4.b";
    const keys1 = parseAnswerKeys(text1);
    assert.strictEqual(keys1.length, 4);
    assert.deepEqual(keys1[0], { questionNumber: 1, correctAnswer: 'D' });
    assert.deepEqual(keys1[1], { questionNumber: 2, correctAnswer: 'A' });

    const text2 = "1-D\n2-A\n3-C";
    const keys2 = parseAnswerKeys(text2);
    assert.strictEqual(keys2.length, 3);
    assert.deepEqual(keys2[2], { questionNumber: 3, correctAnswer: 'C' });

    const text3 = "1) D\n2) A\n3) B";
    const keys3 = parseAnswerKeys(text3);
    assert.strictEqual(keys3.length, 3);
    assert.deepEqual(keys3[0], { questionNumber: 1, correctAnswer: 'D' });
  });
});

test('Phase 7: Generic Stem MCQ deduplication (contentHash)', async (t) => {
  await t.test('different options with same generic stem generate different content hashes', () => {
    const q1 = {
      question: "Pick the correct answer",
      options: ["A. 2+2=4", "B. 2+2=5", "C. 2+2=6", "D. 2+2=7"],
      correctAnswer: "A",
      type: "mcq"
    };

    const q2 = {
      question: "Pick the correct answer",
      options: ["A. Earth is flat", "B. Earth revolves around Sun", "C. Sun revolves around Earth", "D. Moon is a star"],
      correctAnswer: "B",
      type: "mcq"
    };

    const hash1 = QuestionDuplicateDetector.contentHash(q1);
    const hash2 = QuestionDuplicateDetector.contentHash(q2);

    assert.notStrictEqual(hash1, hash2, 'Content hashes must differ even with the same question stem');

    const norm1 = QuestionDuplicateDetector.normalize(q1.question);
    const norm2 = QuestionDuplicateDetector.normalize(q2.question);
    const qHash1 = QuestionDuplicateDetector.hash(norm1);
    const qHash2 = QuestionDuplicateDetector.hash(norm2);

    assert.strictEqual(qHash1, qHash2, 'Legacy questionHash must be identical since stem is identical');
  });
});

test('Phase 8 & 9: Smart Quarantine & Confidence Scoring Rewrite', async (t) => {
  const { OCRProviderAdapter } = require('../src/services/ocrProviderAdapter');
  
  await t.test('calculates weighted composite score correctly and applies penalty for missing options', () => {
    const parsedQuestions = [
      {
        question: "Calculate the value of limit x -> 0 for sin(x)/x.",
        options: [
          { label: 'A', text: '1' },
          { label: 'B', text: '' }, // missing options
          { label: 'C', text: '' },
          { label: 'D', text: '' }
        ],
        format: 'mcq',
        questionNumber: '1',
        rawChunk: "1. Calculate value of limit... \n A. 1",
        blockClass: { confidence: 0.8 },
        sectionTitle: 'Default',
        sectionConfidence: 0.9,
        sourceUsed: 'mock',
        layoutMetadata: {}
      }
    ];

    const mockOcrResult = {
      rawText: "1. Calculate value of limit... \n A. 1",
      latex: "1. Calculate value of limit... \n A. 1",
      confidence: 0.9,
      lines: []
    };

    const result = OCRPipeline.runValidation(
      parsedQuestions,
      mockOcrResult,
      'MCQ_PAGE',
      [],
      0,
      null,
      'test.pdf',
      []
    );

    const question = result.parsedQuestions[0];
    assert.strictEqual(question.extractionState, 'QUARANTINED', 'Should be quarantined due to missing options');
    assert.ok(question.quarantineReasons.includes('MISSING_OPTIONS'), 'Quarantine reason should be MISSING_OPTIONS');
    assert.ok(question.confidenceScores.composite < 0.70, 'Composite score should be lower due to penalties');
    assert.ok(question.confidenceScores.breakdown.penaltiesApplied.includes('missingAnswers'), 'Should show missingAnswers penalty');
  });

  await t.test('quarantines invalid LaTeX syntax', () => {
    const parsedQuestions = [
      {
        question: "Evaluate the integral \\int_{0}^{1} x^2 dx } unclosed brace",
        options: [],
        format: 'descriptive',
        questionNumber: '2',
        rawChunk: "2. Evaluate integral \\int_{0}^{1} x^2 dx } unclosed brace",
        blockClass: { confidence: 0.9 },
        sectionTitle: 'Default',
        sectionConfidence: 0.9,
        sourceUsed: 'mock',
        layoutMetadata: {}
      }
    ];

    const mockOcrResult = {
      rawText: "2. Evaluate integral... ",
      latex: "2. Evaluate integral... ",
      confidence: 0.9,
      lines: []
    };

    const result = OCRPipeline.runValidation(
      parsedQuestions,
      mockOcrResult,
      'THEORY_PAGE',
      [],
      0,
      null,
      'test.pdf',
      []
    );

    const question = result.parsedQuestions[0];
    assert.strictEqual(question.extractionState, 'QUARANTINED', 'Should be quarantined due to invalid LaTeX');
    assert.ok(question.quarantineReasons.includes('INVALID_LATEX'), 'Quarantine reason should be INVALID_LATEX');
  });
});

test('Phase 11: QA Report Verification', async (t) => {
  await t.test('generates quality report structure correctly', () => {
    const report = PdfController.generateQAReport({
      expectedQuestions: 15,
      extractedQuestions: 15,
      totalRejected: 0,
      answerKeysFound: 15,
      footerPollutionDetected: false,
      chapterHeadingsRemoved: 1,
      duplicatesPrevented: 0,
      quarantinedQuestions: 0
    });

    assert.strictEqual(report.expectedQuestions, 15);
    assert.strictEqual(report.extractedQuestions, 15);
    assert.strictEqual(report.missingQuestions, 0);
    assert.strictEqual(report.answerKeysFound, 15);
    assert.strictEqual(report.footerPollutionDetected, false);
    assert.strictEqual(report.chapterHeadingsRemoved, 1);
    assert.strictEqual(report.quarantinedQuestions, 0);
    assert.ok(report.overallQualityScore >= 95, 'Score should be high for perfect run');
  });
});
