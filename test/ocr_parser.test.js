const assert = require('assert');
const { MCQDetector, QuestionSegmenter } = require('../src/services/ocrPipeline');

describe('OCR Parser - segmentation and MCQ detection', function() {
  it('should segment multiple numbered questions correctly', function() {
    const text = `1. What is 2+2?\nA. 3\nB. 4\nC. 5\n\n2. Evaluate \n\nQ3. Another question?`;
    const segs = QuestionSegmenter.segment(text);
    assert(segs.length >= 2, 'Expected at least 2 segments');
    assert(segs[0].text.includes('1.'), 'First segment should include question 1');
  });

  it('should parse MCQ options in a standard block', function() {
    const block = `12. Compute:\nA. $1$\nB. $2$\nC. $3$\nD. $4`;
    const detected = MCQDetector.detect(block);
    assert(detected, 'MCQDetector should return a parsed object');
    assert(detected.options && detected.options.length === 4, 'Should detect 4 options');
  });
});
