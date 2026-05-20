const test = require('node:test');
const assert = require('node:assert/strict');
const { MCQDetector, QuestionSegmenter } = require('../src/services/ocrPipeline');

test('should segment multiple numbered questions correctly', () => {
  const text = `1. What is 2+2?\nA. 3\nB. 4\nC. 5\n\n2. Evaluate\nA. x\nB. y\n\nQ3. Another question?`;
  const segs = QuestionSegmenter.segment(text);
  assert.ok(segs.length >= 2, 'Expected at least 2 segments');
  assert.ok(segs[0].text.includes('1.'), 'First segment should include question 1');
});

test('should parse MCQ options in a standard block', () => {
  const block = `12. Compute:\nA. $1$\nB. $2$\nC. $3$\nD. $4`;
  const detected = MCQDetector.detect(block);
  assert.ok(detected, 'MCQDetector should return a parsed object');
  assert.equal(detected.options.length, 4, 'Should detect 4 options');
});
