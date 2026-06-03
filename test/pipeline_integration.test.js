/**
 * Production-Grade OCR Pipeline Test Suite
 * Tests all 20 phases of the document-understanding architecture.
 *
 * Coverage:
 *  - MCQ pages (standard, inline, Bengali, Roman)
 *  - Fill-in-blank pages
 *  - Column-matching / table pages
 *  - Answer key pages (must be BLOCKED)
 *  - Mixed pages
 *  - LaTeX preservation (fractions, trig, superscripts)
 *  - Section routing correctness
 *  - Structural validation (garbage rejection)
 *  - Confidence scoring
 *  - Parser state isolation (cross-section contamination prevention)
 *  - Image quality assessment
 */

'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { PageClassificationEngine, PAGE_TYPES, PARSER_TYPES } = require('../src/services/pageClassificationEngine');
const { FillInBlankParser }    = require('../src/services/fillInBlankParser');
const { ColumnMatchingParser } = require('../src/services/columnMatchingParser');
const { MCQOptionParser }      = require('../src/services/mcqOptionParser');
const { QuestionValidator }    = require('../src/services/questionValidator');
const { LatexSanitizer }       = require('../src/services/latexSanitizer');
const { OCRNormalizer }        = require('../src/services/ocrNormalizer');
const { ContentClassificationEngine } = require('../src/services/contentClassificationEngine');
const { QuestionSegmenter }    = require('../src/services/questionSegmenter');
const { OCRPipeline }          = require('../src/services/ocrPipeline');
const { OCRProviderAdapter }   = require('../src/services/ocrProviderAdapter');

// ─── HELPER ──────────────────────────────────────────────────────────────────

/** Mock OCR provider to return controlled text */
function mockOCR(text, confidence = 0.95) {
  const orig = OCRProviderAdapter.processImage;
  OCRProviderAdapter.processImage = async () => ({ rawText: text, latex: text, confidence });
  return () => { OCRProviderAdapter.processImage = orig; };
}

async function runPipeline(text, confidence = 0.95) {
  const restore = mockOCR(text, confidence);
  try {
    return await OCRPipeline.runFromBuffer(Buffer.from('mock'), 'image/jpeg', 'test.jpg');
  } finally {
    restore();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 1: PageClassificationEngine
// ─────────────────────────────────────────────────────────────────────────────

describe('[PageClassificationEngine]', () => {

  test('classifies MCQ page with (A)(B)(C)(D) options', () => {
    const text = `1. What is the derivative of sin x?
(A) cos x
(B) -cos x
(C) -sin x
(D) tan x
2. What is \\frac{d}{dx}(x^2)?
(A) 2x
(B) x
(C) 2
(D) x^2`;
    const r = PageClassificationEngine.classifyPage(text);
    assert.equal(r.pageType, PAGE_TYPES.MCQ_PAGE, `Expected MCQ_PAGE, got ${r.pageType}`);
  });

  test('classifies fill-in-blank page', () => {
    const text = `Fill in the Blanks
1. sin 90° = _____
2. cos 0° = _____
3. tan 45° = _____`;
    const r = PageClassificationEngine.classifyPage(text);
    assert.equal(r.pageType, PAGE_TYPES.FILL_BLANK_PAGE);
  });

  test('classifies Bengali fill-in-blank page', () => {
    const text = `শূন্যস্থান পূরণ করো
1. sin 90° = _____
2. cos 0° = _____`;
    const r = PageClassificationEngine.classifyPage(text);
    assert.equal(r.pageType, PAGE_TYPES.FILL_BLANK_PAGE);
  });

  test('classifies column-matching page (Column A / Column B)', () => {
    const text = `Match the following:
Column A          Column B
(i) sin θ         (a) 1/cos θ
(ii) cos θ        (b) opposite/hypotenuse
(iii) sec θ       (c) adjacent/hypotenuse`;
    const r = PageClassificationEngine.classifyPage(text);
    assert.equal(r.pageType, PAGE_TYPES.COLUMN_MATCH_PAGE);
  });

  test('classifies answer key page — dense pattern', () => {
    const text = `1. (A)\n2. (B)\n3. (C)\n4. (D)\n5. (A)\n6. (C)\n7. (B)`;
    const r = PageClassificationEngine.classifyPage(text);
    assert.equal(r.pageType, PAGE_TYPES.ANSWER_KEY_PAGE);
  });

  test('classifies answer key page — explicit heading', () => {
    const text = `উত্তরমালা\n1. A\n2. B\n3. D\n4. C`;
    const r = PageClassificationEngine.classifyPage(text);
    assert.equal(r.pageType, PAGE_TYPES.ANSWER_KEY_PAGE);
  });

  test('MCQ options like (C) -1 do NOT trigger column-match', () => {
    const text = `1. Value of cos 180°?
(A) 0
(B) 1
(C) -1
(D) undefined`;
    const r = PageClassificationEngine.classifyPage(text);
    assert.notEqual(r.pageType, PAGE_TYPES.COLUMN_MATCH_PAGE,
      `(C) -1 should not trigger COLUMN_MATCH_PAGE`);
  });

  test('section headings correctly route parsers', () => {
    assert.equal(PageClassificationEngine.classifySectionHeading('Fill in the Blanks').parserType, PARSER_TYPES.FILL);
    assert.equal(PageClassificationEngine.classifySectionHeading('Column Matching').parserType, PARSER_TYPES.TABLE);
    assert.equal(PageClassificationEngine.classifySectionHeading('উত্তরমালা').parserType, PARSER_TYPES.ANSWER_KEY);
    assert.equal(PageClassificationEngine.classifySectionHeading('শূন্যস্থান').parserType, PARSER_TYPES.FILL);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 2: MCQOptionParser
// ─────────────────────────────────────────────────────────────────────────────

describe('[MCQOptionParser]', () => {

  test('standard (A)(B)(C)(D) inline format', () => {
    const text = `What is sin 30°? (A) 1/2 (B) √3/2 (C) 1 (D) 0`;
    const r = MCQOptionParser.parse(text);
    assert.ok(r, 'Should parse MCQ');
    assert.ok(r.options.filter(o => o.text.trim()).length >= 3, 'Should have 3+ options');
  });

  test('line-based A. B. C. D. format', () => {
    const text = `What is the value of tan 45°?
A. 0
B. 1
C. √3
D. Undefined`;
    const r = MCQOptionParser.parse(text);
    assert.ok(r, 'Should parse line-based MCQ');
    assert.ok(r.options.find(o => o.label === 'B' && o.text.includes('1')), 'Option B should be 1');
  });

  test('Bengali label format ক খ গ ঘ', () => {
    const text = `\\sin 30° = ?
ক. 1/2
খ. √3/2
গ. 1
ঘ. 0`;
    const r = MCQOptionParser.parse(text);
    assert.ok(r, 'Should parse Bengali labels');
    assert.ok(r.options.filter(o => o.text.trim()).length >= 3, 'Should have 3+ options');
  });

  test('Roman numeral format (i)(ii)(iii)(iv)', () => {
    const text = `Consider the following:
(i) sin²θ + cos²θ = 1
(ii) 1 + tan²θ = sec²θ
(iii) 1 + cot²θ = csc²θ
(iv) tanθ = sinθ/cosθ
Which are correct?`;
    const r = MCQOptionParser.parse(text);
    assert.ok(r, 'Should parse Roman numeral options');
    assert.ok(r.options.filter(o => o.text.trim()).length >= 3, 'Should have 3+ options');
  });

  test('multi-line option wrapping', () => {
    const text = `1. If \\alpha + \\beta = \\pi, then the value of
sin(\\alpha + \\beta) equals:
A. sin \\alpha cos \\beta +
   cos \\alpha sin \\beta
B. 0
C. 1
D. -1`;
    const r = MCQOptionParser.parse(text);
    assert.ok(r, 'Should handle multi-line options');
  });

  test('math-only question with LaTeX options', () => {
    const text = `$\\frac{1+\\cos 2\\theta}{1-\\cos 2\\theta}$ equals:
(A) $\\tan^2\\theta$
(B) $\\cot^2\\theta$
(C) $\\sin^2\\theta$
(D) $\\cos^2\\theta$`;
    const r = MCQOptionParser.parse(text);
    assert.ok(r, 'Should parse math-only MCQ');
    assert.ok(r.options.filter(o => o.text.trim()).length >= 3);
  });

  test('recovers real question text when parser returns placeholder', () => {
    const text = `3. What is 2 + 2?
A. 3
B. 4
C. 5
D. 6`;
    const r = MCQOptionParser.parse(text);
    assert.ok(r, 'Should parse');
    // Question should NOT be placeholder
    assert.notEqual(r.question.trim().toLowerCase(), 'question text');
    assert.notEqual(r.question.trim().toLowerCase(), 'question');
  });

  test('does NOT parse answer key patterns as MCQ options', () => {
    const text = `5. (B)`;
    const r = MCQOptionParser.parse(text);
    // Either null (good) or has < 2 valid options (also good)
    if (r) {
      const filled = r.options.filter(o => o.text && o.text.trim());
      assert.ok(filled.length < 2, 'Answer key should not produce valid MCQ');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 3: FillInBlankParser
// ─────────────────────────────────────────────────────────────────────────────

describe('[FillInBlankParser]', () => {

  test('detects underscore blanks', () => {
    const r = FillInBlankParser.parse('1. sin 90° = _____');
    assert.equal(r.format, 'fill_in_blank');
    assert.equal(r.options.length, 0, 'Should never have MCQ options');
    assert.ok(r.blankCount >= 1, 'Should count blanks');
  });

  test('detects dot blanks (...)', () => {
    const r = FillInBlankParser.parse('The value of sin 0° is ......');
    assert.equal(r.format, 'fill_in_blank');
    assert.ok(r.blankCount >= 1);
    assert.equal(r.options.length, 0);
  });

  test('detects spaced dot blanks (. . . .)', () => {
    const r = FillInBlankParser.parse('cos(A-B) = . . . .');
    assert.equal(r.format, 'fill_in_blank');
    assert.equal(r.options.length, 0);
  });

  test('NEVER fabricates MCQ options', () => {
    const r = FillInBlankParser.parse('\\cos 4A \\cos 2A = _____');
    assert.equal(r.options.length, 0, 'Fill parser must not fabricate options');
  });

  test('removes leading question number from question text', () => {
    const r = FillInBlankParser.parse('5. The answer is _____');
    assert.ok(!r.question.startsWith('5.'), 'Should strip leading question number');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 4: ColumnMatchingParser
// ─────────────────────────────────────────────────────────────────────────────

describe('[ColumnMatchingParser]', () => {

  test('parses pipe table format', () => {
    const text = `Match the following:
| Column A | Column B |
|---|---|
| (i) sin θ | (a) opp/hyp |
| (ii) cos θ | (b) adj/hyp |`;
    const r = ColumnMatchingParser.parse(text);
    assert.equal(r.format, 'column_matching');
    assert.ok(r.columnA.length > 0 || r.question.length > 0, 'Should extract column data');
  });

  test('parses LaTeX tabular', () => {
    const text = `\\begin{tabular}{|l|l|}
\\hline
Column A & Column B \\\\
\\hline
(i) alpha & (a) first \\\\
(ii) beta & (b) second \\\\
\\hline
\\end{tabular}`;
    const r = ColumnMatchingParser.parse(text);
    assert.equal(r.format, 'column_matching');
    assert.ok(r.columnA.length > 0, 'Should extract columnA');
  });

  test('NEVER produces MCQ options from table', () => {
    const text = `| (i) sin | (a) 1 |\n| (ii) cos | (b) 0 |`;
    const r = ColumnMatchingParser.parse(text);
    assert.equal(r.format, 'column_matching');
    // Should not have fabricated A/B/C/D options
    const hasFilledMCQOptions = r.options.some(o => {
      const t = typeof o === 'string' ? o : (o.text || '');
      return t.trim().length > 0;
    });
    assert.equal(hasFilledMCQOptions, false, 'Table parser must not produce MCQ options');
  });

  test('extracts inline matching choices', () => {
    const text = `The correct matching is:
(i)-(a), (ii)-(c), (iii)-(b)`;
    const r = ColumnMatchingParser.parse(text);
    assert.equal(r.format, 'column_matching');
    assert.ok(r.matchingChoices.length > 0, 'Should extract matching choices');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 5: LaTeX Stabilization
// ─────────────────────────────────────────────────────────────────────────────

describe('[LatexSanitizer]', () => {

  test('preserves valid fraction — does NOT corrupt', () => {
    const frac = '\\frac{1+\\cos 2\\theta}{1-\\cos 2\\theta}';
    const result = LatexSanitizer.sanitize(frac, 0.95);
    assert.ok(result.includes('\\frac'), 'Should preserve \\frac');
    assert.ok(result.includes('\\cos'), 'Should preserve \\cos');
    assert.ok(!result.includes('\\frac{1+\\cos}{2}'), 'Must not corrupt fraction');
  });

  test('preserves valid sqrt', () => {
    const sq = '\\sqrt{a^2 + b^2}';
    const result = LatexSanitizer.sanitize(sq, 0.95);
    assert.ok(result.includes('\\sqrt'), 'Should preserve \\sqrt');
    assert.ok(result.includes('a^2'), 'Should preserve superscript');
  });

  test('normalizes unicode symbols', () => {
    const text = 'a − b × c ÷ d';
    const result = LatexSanitizer.sanitize(text);
    assert.ok(result.includes('-'), 'Should convert unicode minus');
    assert.ok(result.includes('\\times'), 'Should convert ×');
    assert.ok(result.includes('\\div'), 'Should convert ÷');
  });

  test('does NOT inject braces into valid LaTeX', () => {
    const valid = '\\sin^2\\theta + \\cos^2\\theta = 1';
    const result = LatexSanitizer.sanitize(valid, 0.95);
    // Should not add spurious braces
    const extraBraces = (result.match(/\{/g) || []).length - (valid.match(/\{/g) || []).length;
    assert.ok(extraBraces <= 0, `Should not inject braces. Added: ${extraBraces}`);
  });

  test('validates balanced braces correctly', () => {
    assert.equal(LatexSanitizer.isBalancedBraces('\\frac{a}{b}'), true);
    assert.equal(LatexSanitizer.isBalancedBraces('\\frac{a}{b'), false);
    assert.equal(LatexSanitizer.isBalancedBraces('}\\frac{a}{b}'), false);
  });

  test('greek letters converted to LaTeX', () => {
    const text = 'α + β = γ';
    const result = LatexSanitizer.sanitize(text);
    assert.ok(result.includes('\\alpha'), 'α → \\alpha');
    assert.ok(result.includes('\\beta'),  'β → \\beta');
    assert.ok(result.includes('\\gamma'), 'γ → \\gamma');
  });

  test('does not corrupt trig function names', () => {
    const text = '\\sin(x) + \\cos(x) = \\tan(x)';
    const result = LatexSanitizer.sanitize(text, 0.95);
    assert.ok(result.includes('\\sin'), 'Must preserve \\sin');
    assert.ok(result.includes('\\cos'), 'Must preserve \\cos');
    assert.ok(result.includes('\\tan'), 'Must preserve \\tan');
  });

  test('removes dangerous injection commands', () => {
    const text = 'x = 1 \\input{/etc/passwd} + 2';
    const result = LatexSanitizer.sanitize(text);
    assert.ok(!result.includes('\\input'), 'Must remove \\input');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 6: QuestionValidator — Structural Validation
// ─────────────────────────────────────────────────────────────────────────────

describe('[QuestionValidator]', () => {

  test('valid MCQ passes', () => {
    const r = QuestionValidator.validate({
      question: 'What is sin 90°?',
      options: [
        { label: 'A', text: '0' },
        { label: 'B', text: '1' },
        { label: 'C', text: '-1' },
        { label: 'D', text: '2' }
      ],
      format: 'mcq', ocrConfidence: 0.95,
    });
    assert.ok(r.isValid, `Should be valid. Errors: ${r.errors.join(', ')}`);
  });

  test('rejects "Question Text" placeholder', () => {
    const r = QuestionValidator.validate({
      question: 'Question Text',
      options: [
        { label: 'A', text: '' },
        { label: 'B', text: '& 4.' },
        { label: 'C', text: '' },
        { label: 'D', text: '&' }
      ],
      format: 'mcq', ocrConfidence: 0.9,
    });
    assert.ok(!r.isValid, 'Placeholder should be rejected');
  });

  test('rejects answer key leak "5. (B)"', () => {
    const r = QuestionValidator.validate({
      question: '5. (B)', options: [], format: 'mcq', ocrConfidence: 0.9,
    });
    assert.ok(!r.isValid, 'Answer key leak must be rejected');
  });

  test('rejects section header leak "Fill in the Blanks"', () => {
    const r = QuestionValidator.validate({
      question: 'Fill in the Blanks', options: [], format: 'mcq', ocrConfidence: 0.9,
    });
    assert.ok(!r.isValid, 'Section header must be rejected');
  });

  test('rejects fill-in-blank with fabricated MCQ options', () => {
    const r = QuestionValidator.validate({
      question: 'sin 90 = _____',
      options: [
        { label: 'A', text: '1' },
        { label: 'B', text: '0' },
        { label: 'C', text: '-1' },
        { label: 'D', text: '2' }
      ],
      format: 'fill_in_blank', ocrConfidence: 0.9,
    });
    assert.ok(!r.isValid, 'Fill with MCQ options must be rejected');
  });

  test('rejects too-short fragment', () => {
    const r = QuestionValidator.validate({
      question: 'A', options: [], format: 'mcq', ocrConfidence: 0.9,
    });
    assert.ok(!r.isValid, 'Too-short fragment must be rejected');
  });

  test('rejects LaTeX artifact options', () => {
    const r = QuestionValidator.validate({
      question: 'What is the value?',
      options: [
        { label: 'A', text: '& 4.' },
        { label: 'B', text: '&' },
        { label: 'C', text: '' },
        { label: 'D', text: '' }
      ],
      format: 'mcq', ocrConfidence: 0.9,
    });
    assert.ok(!r.isValid, 'Artifact options must be rejected');
  });

  test('accepts valid LaTeX MCQ', () => {
    const r = QuestionValidator.validate({
      question: 'What is $\\frac{1+\\cos 2\\theta}{1-\\cos 2\\theta}$?',
      options: [
        { label: 'A', text: '$\\tan^2\\theta$' },
        { label: 'B', text: '$\\cot^2\\theta$' },
        { label: 'C', text: '$\\sin^2\\theta$' },
        { label: 'D', text: '$\\cos^2\\theta$' }
      ],
      format: 'mcq', ocrConfidence: 0.92,
    });
    assert.ok(r.isValid, `LaTeX MCQ should be valid. Errors: ${r.errors.join(', ')}`);
  });

  test('accepts column-matching question', () => {
    const r = QuestionValidator.validate({
      question: 'Match the trigonometric values:',
      columnA: [{ label: 'i', text: 'sin θ' }],
      columnB: [{ label: 'a', text: 'opp/hyp' }],
      options: [], format: 'column_matching', ocrConfidence: 0.9,
    });
    assert.ok(r.isValid, `Column match should be valid. Errors: ${r.errors.join(', ')}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 7: OCR Normalizer
// ─────────────────────────────────────────────────────────────────────────────

describe('[OCRNormalizer]', () => {

  test('normalizes line endings', () => {
    const r = OCRNormalizer.normalizeText('a\r\nb\rc');
    assert.ok(!r.includes('\r'), 'Should remove carriage returns');
  });

  test('repairs broken question numbering', () => {
    const r = OCRNormalizer.normalizeText('11 . What is sin?');
    assert.ok(r.includes('11.'), `Should repair broken numbering. Got: "${r}"`);
  });

  test('does NOT merge question boundaries', () => {
    const text = '1. Question one\n2. Question two';
    const r = OCRNormalizer.normalizeText(text);
    assert.ok(r.includes('1.'), 'Q1 header preserved');
    assert.ok(r.includes('2.'), 'Q2 header preserved');
    assert.ok(!r.includes('1. Question one 2.'), 'Should not merge questions');
  });

  test('does NOT merge option labels', () => {
    const text = 'Question?\nA. Option one\nB. Option two';
    const r = OCRNormalizer.normalizeText(text);
    assert.ok(r.includes('A.') && r.includes('B.'), 'Option labels preserved');
  });

  test('collapses excessive blank lines', () => {
    const r = OCRNormalizer.normalizeText('line1\n\n\n\n\nline2');
    const blankRuns = (r.match(/\n{3,}/g) || []).length;
    assert.equal(blankRuns, 0, 'Should have no 3+ consecutive newlines');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 8: ContentClassificationEngine
// ─────────────────────────────────────────────────────────────────────────────

describe('[ContentClassificationEngine]', () => {

  test('ignores publisher branding', () => {
    const filtered = ContentClassificationEngine.filterNoise('CHHAYA MATHEMATICS\n1. Real question?');
    assert.ok(!filtered.includes('CHHAYA MATHEMATICS'), 'Should filter branding');
    assert.ok(filtered.includes('Real question'), 'Should keep real content');
  });

  test('ignores page numbers', () => {
    const filtered = ContentClassificationEngine.filterNoise('Page 45\n1. What is sin?');
    assert.ok(!filtered.includes('Page 45'), 'Should filter page number');
  });

  test('identifies dense answer blocks', () => {
    const text = '1. (A)\n2. (B)\n3. (C)\n4. (D)\n5. (A)\n6. (B)';
    assert.ok(ContentClassificationEngine.isAnswerKeyPage(text), 'Should detect answer key page');
  });

  test('does NOT flag real questions as answer keys', () => {
    const text = '1. What is the derivative of sin x?\n(A) cos x\n(B) -sin x\n(C) tan x\n(D) cot x';
    assert.ok(!ContentClassificationEngine.isAnswerKeyPage(text), 'Should not flag real MCQ as answer key');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 9: QuestionSegmenter
// ─────────────────────────────────────────────────────────────────────────────

describe('[QuestionSegmenter]', () => {

  test('segments multiple numbered questions', () => {
    const text = `1. What is sin 30°?\n(A) 1/2 (B) √3/2 (C) 1 (D) 0
2. What is cos 60°?\n(A) 1/2 (B) √3/2 (C) 0 (D) 1
3. What is tan 45°?\n(A) 0 (B) 1 (C) √3 (D) 1/√3`;
    const segments = QuestionSegmenter.segment(text);
    assert.ok(segments.length >= 3, `Should detect 3 questions, got ${segments.length}`);
  });

  test('does not cross-contaminate options between questions', () => {
    const text = `1. First question?
(A) alpha
(B) beta
2. Second question?
(A) gamma
(B) delta`;
    const segments = QuestionSegmenter.segment(text);
    assert.ok(segments.length >= 2, 'Should produce 2+ segments');
    // Q1 should not contain Q2 options
    const q1 = segments[0].text;
    assert.ok(!q1.includes('gamma'), 'Q1 should not contain Q2 options');
  });

  test('handles Bengali question prefix', () => {
    const text = `প্রশ্ন ১: sin 30° = ?\n(A) 1/2\n(B) √3/2`;
    const segments = QuestionSegmenter.segment(text);
    assert.ok(segments.length >= 1, 'Should segment Bengali question');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 10: Full OCRPipeline Integration Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('[OCRPipeline] Integration', () => {

  test('answer key page is completely blocked', async () => {
    const result = await runPipeline(
      'উত্তরমালা\n1. (A)\n2. (B)\n3. (C)\n4. (D)\n5. (A)\n6. (C)'
    );
    assert.equal(result.parsedQuestions.length, 0, 'Answer key should produce 0 questions');
    assert.equal(result.pageType, 'ANSWER_KEY_PAGE');
  });

  test('MCQ page produces correctly parsed questions', async () => {
    const result = await runPipeline(`1. What is sin 30°?
(A) 1/2
(B) √3/2
(C) 1
(D) 0
2. What is cos 60°?
(A) 1/2
(B) √3/2
(C) 0
(D) 1`);
    assert.ok(result.parsedQuestions.length >= 2, `Should extract 2+ questions, got ${result.parsedQuestions.length}`);
    const q1 = result.parsedQuestions[0];
    assert.ok(q1.format !== 'fill_in_blank', 'MCQ should not be classified as fill');
    assert.ok(q1.format !== 'column_matching', 'MCQ should not be classified as table');
  });

  test('section routing: fill section routed to fill parser', async () => {
    const result = await runPipeline(`\\section*{Fill in the Blanks}
2. The value of sin(90°) is _____
\\section*{MCQ Questions}
3. What is 2 + 2?
A. 3
B. 4
C. 5
D. 6`);

    assert.ok(result.parsedQuestions.length >= 2, `Should extract 2+ questions, got ${result.parsedQuestions.length}`);

    const fillQ = result.parsedQuestions.find(q => q.format === 'fill_in_blank');
    assert.ok(fillQ, 'Should have a fill_in_blank question');
    assert.equal(fillQ.options.filter(o => o.text && o.text.trim()).length, 0,
      'Fill question must have 0 fabricated options');
  });

  test('LaTeX fractions preserved through full pipeline', async () => {
    const result = await runPipeline(`1. What is $\\frac{1+\\cos 2\\theta}{1-\\cos 2\\theta}$?
(A) $\\tan^2\\theta$
(B) $\\cot^2\\theta$
(C) $\\sin^2\\theta$
(D) $\\cos^2\\theta$`);

    assert.ok(result.parsedQuestions.length >= 1, 'Should extract at least 1 question');
    const q = result.parsedQuestions[0];
    // Fraction must be preserved
    assert.ok(q.question.includes('\\frac') || q.question.includes('frac'),
      `Fraction must be preserved. Got: "${q.question}"`);
    assert.ok(!q.question.includes('\\frac{1+\\cos}{2}'),
      'Fraction must not be corrupted');
  });

  test('garbage objects are rejected by validation', async () => {
    const result = await runPipeline(
      'A\n& 4.\n&\nQuestion Text'  // pure garbage
    );
    // Either 0 questions or none that are garbage
    for (const q of result.parsedQuestions) {
      const qText = q.question || '';
      assert.notEqual(qText.toLowerCase().trim(), 'question text',
        'Placeholder question text must be rejected');
      assert.ok(qText.trim().length >= 5, 'Fragment too short must be rejected');
    }
  });

  test('each question has confidence scores', async () => {
    const result = await runPipeline(`1. sin(90°) = ?
(A) 0
(B) 1
(C) -1
(D) 2`);

    if (result.parsedQuestions.length > 0) {
      const q = result.parsedQuestions[0];
      assert.ok(q.confidenceScores, 'Should have confidence scores');
      assert.ok(typeof q.confidenceScores.composite === 'number', 'Composite score should be a number');
    }
  });

  test('page type is returned in result', async () => {
    const result = await runPipeline(`1. Test question?
(A) A
(B) B
(C) C
(D) D`);
    assert.ok(result.pageType, 'Should include pageType in result');
  });

  test('section information returned in result', async () => {
    const result = await runPipeline(`\\section*{MCQ}
1. Test?
(A) A
(B) B
(C) C
(D) D`);
    assert.ok(Array.isArray(result.sections), 'Should include sections array');
  });

  test('parser state resets between sections', async () => {
    // Same question number in two different sections should both appear
    const result = await runPipeline(`\\section*{Conventional Type}
1. First section Q1?
(A) a1
(B) b1
(C) c1
(D) d1
\\section*{Multiple Choice Questions}
1. Second section Q1?
(A) a2
(B) b2
(C) c2
(D) d2`);

    // Both Q1s should appear (state reset between sections)
    assert.ok(result.parsedQuestions.length >= 2,
      `Should extract 2 questions (one per section). Got: ${result.parsedQuestions.length}`);
  });
});
