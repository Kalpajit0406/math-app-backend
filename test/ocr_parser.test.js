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
