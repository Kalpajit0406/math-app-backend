const test = require('node:test');
const assert = require('node:assert/strict');
const { MCQDetector, QuestionSegmenter } = require('../src/services/ocrPipeline');

function createSegmentationCase(name, input, expectedMinSegments, assertions = null) {
  test(`[segment] ${name}`, () => {
    const segs = QuestionSegmenter.segment(input);
    assert.ok(segs.length >= expectedMinSegments, `Expected at least ${expectedMinSegments} segments but got ${segs.length}`);
    if (assertions) assertions(segs);
  });
}

function createMcqCase(name, input, assertions) {
  test(`[mcq] ${name}`, () => {
    const parsed = MCQDetector.detect(input);
    assert.ok(parsed, 'Expected parser to return a result');
    assert.ok(Array.isArray(parsed.options), 'Expected options array');
    assertions(parsed);
  });
}

createSegmentationCase(
  'multiple numbered boundaries',
  `1. What is 2+2?\nA. 3\nB. 4\nC. 5\n\n2. Evaluate\nA. x\nB. y\n\nQ3. Another question?`,
  2,
  (segs) => {
    assert.ok(segs[0].text.includes('1.'), 'First segment should include Q1 header');
  }
);

createSegmentationCase(
  'prevents cross-question leakage into options',
  `11. Choose the correct identity\nA. x + y\nB. x - y\nC. x^2\nD. y^2\n12. Evaluate integral\nA. 1\nB. 2`,
  2,
  (segs) => {
    assert.ok(!segs[0].text.includes('\n12.'), 'Question 12 header leaked into question 11 segment');
  }
);

createMcqCase(
  'standard A-D options',
  `12. Compute:\nA. $1$\nB. $2$\nC. $3$\nD. $4`,
  (parsed) => {
    assert.equal(parsed.options.length, 4, 'Should normalize to 4 options');
    assert.equal(parsed.options[1].label, 'B');
  }
);

createMcqCase(
  'roman option labels and multiline options',
  `Question 7 Find value\ni. first line\ncontinued line\nii. second\niii. third\niv. fourth`,
  (parsed) => {
    assert.equal(parsed.options.length, 4);
    assert.ok(parsed.options[0].text.includes('continued line'));
  }
);

createMcqCase(
  'numeric option labels',
  `Q9 Solve\n1. one\n2. two\n3. three\n4. four`,
  (parsed) => {
    assert.equal(parsed.options.length, 4);
    assert.equal(parsed.options[2].label, 'C');
  }
);

// ── NEW: Bug-fix regression tests ────────────────────────────────────────────

// Bug 1: Mathpix returns multiple questions inline without newlines between them.
// The old segmenter would put everything in segment 1.
// e.g. a 30-question printed exam paper scanned as one image.
createSegmentationCase(
  'inline question numbers - Mathpix printed exam format',
  `11. The probability of an event is $\\frac{1}{6}$ (A) $\\frac{1}{18}$ (B) $\\frac{1}{9}$ (C) $\\frac{1}{12}$ (D) $\\frac{5}{36}$12. Two events $A$ and $B$ are mutually exclusive if (A) $P(A)+P(B)=1$ (B) $P(A\\cup B)=1$ (C) $P(A\\cap B)=0$ (D) $P(A|B)=0$13. The mode of $2,3,3,4,5$ is (A) 2 (B) 3 (C) 4 (D) 5`,
  3,
  (segs) => {
    assert.equal(segs.length, 3, `Expected 3 segments (Q11, Q12, Q13) but got ${segs.length}`);
    assert.ok(segs[0].number === '11', `First segment should be Q11, got "${segs[0].number}"`);
    assert.ok(segs[1].number === '12', `Second segment should be Q12, got "${segs[1].number}"`);
    assert.ok(segs[2].number === '13', `Third segment should be Q13, got "${segs[2].number}"`);
  }
);

// Bug 2: MCQ options appear inline on the same line as the question text.
// The old parser only checked line-start patterns, so it returned null for these,
// causing all 4 option fields to be blank in the UI.
createMcqCase(
  'inline (A)...(B)...(C)...(D)... options - Mathpix printed format',
  `11. The probability of an event is $\\frac{1}{6}$ (A) $\\frac{1}{18}$ (B) $\\frac{1}{9}$ (C) $\\frac{1}{12}$ (D) $\\frac{5}{36}$`,
  (parsed) => {
    assert.equal(parsed.options.length, 4, 'Should extract exactly 4 options from inline format');
    assert.ok(parsed.options[0].text.length > 0, 'Option A should not be blank');
    assert.ok(parsed.options[1].text.length > 0, 'Option B should not be blank');
    assert.ok(parsed.options[2].text.length > 0, 'Option C should not be blank');
    assert.ok(parsed.options[3].text.length > 0, 'Option D should not be blank');
    assert.equal(parsed.format, 'inline-mcq', 'Should use inline-mcq format');
    assert.ok(parsed.question.includes('probability'), 'Question text should be extracted before options');
  }
);

createSegmentationCase(
  'numeric option labels do not cause split',
  `Q9. Solve\n1. one\n2. two\n3. three\n4. four`,
  1,
  (segs) => {
    assert.equal(segs.length, 1, `Expected exactly 1 segment for numeric option labels, but got ${segs.length}`);
    assert.equal(segs[0].number, '9');
  }
);

