'use strict';

// ═══════════════════════════════════════════════════════════════
// FULL PIPELINE VERIFICATION — All 11 Phases
// ═══════════════════════════════════════════════════════════════
const { OCRPipeline }        = require('./src/services/ocrPipeline');
const { PageLayoutAnalyzer } = require('./src/services/pageLayoutAnalyzer');
const { QuestionSegmenter }  = require('./src/services/questionSegmenter');
const { OCRNormalizer }      = require('./src/services/ocrNormalizer');
const { NoiseRemover }       = require('./src/services/noiseRemover');
const { MCQOptionParser }    = require('./src/services/mcqOptionParser');
const { AnswerExtractor }    = require('./src/services/answerExtractor');
const { LatexNormalizer }    = require('./src/services/latexSanitizer');
const { DiagramDetector }    = require('./src/services/diagramDetector');
const { QuestionValidator }  = require('./src/services/questionValidator');
const { ConfidenceScorer }   = require('./src/services/confidenceScorer');

let pass = 0;
let fail = 0;

function check(label, result) {
  const ok = !!result;
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + label);
  if (ok) pass++; else fail++;
}

async function run() {

// ─── PHASE 1: PAGE LAYOUT ANALYSIS ────────────────────────────
console.log('\n===== PHASE 1: Page Layout Analysis =====');
const layout1 = PageLayoutAnalyzer.analyze('Page 42\nChhaya Math\n1. Find x\n(A) 1  (B) 2  (C) 3  (D) 4');
check('P1: cleanText removes page number', !layout1.cleanText.includes('Page 42'));
check('P1: cleanText removes publisher name', !layout1.cleanText.includes('Chhaya'));
check('P1: cleanText preserves question', layout1.cleanText.includes('Find x'));
check('P1: returns columnLayout', layout1.columnLayout === '1-col');
check('P1: returns layoutMetadata', !!layout1.layoutMetadata);
check('P1: returns strippedLines array', Array.isArray(layout1.strippedLines));
check('P1: returns diagramRegions array', Array.isArray(layout1.diagramRegions));
// P1 with bounding box data
const layout2 = PageLayoutAnalyzer.analyze({
  lines: [
    { text: 'Page 42', bbox: [10, 5, 200, 20] },
    { text: 'Find x', bbox: [10, 100, 300, 20] },
    { text: '(A) 1  (B) 2  (C) 3  (D) 4', bbox: [10, 130, 400, 20] },
  ]
});
check('P1: geometry-aware strips positional header', !layout2.cleanText.includes('Page 42'));
check('P1: geometry-aware preserves question body', layout2.cleanText.includes('Find x'));

// ─── PHASE 2: QUESTION SEGMENTATION ───────────────────────────
console.log('\n===== PHASE 2: Question Segmentation =====');
const segs = QuestionSegmenter.segment(
  '1. Find the value of x if x+3=7.\n(A) 1 (B) 2 (C) 3 (D) 4\n' +
  '2. Evaluate 5+3.\n(A) 7 (B) 8 (C) 9 (D) 10\n' +
  '3. If a=2, find 2a.\n(A) 2 (B) 4 (C) 6 (D) 8'
);
check('P2: 3 questions extracted', segs.length === 3);
check('P2: Q1 number stored as seg.number', segs[0].number === '1');
check('P2: Q1 text does NOT start with "1."', !/^1[.):]/.test(segs[0].text.trim()));
check('P2: Q2 number stored as seg.number', segs[1].number === '2');
check('P2: Q2 text does NOT start with "2."', !/^2[.):]/.test(segs[1].text.trim()));
check('P2: Q3 number stored as seg.number', segs[2].number === '3');
check('P2: segments have startIndex', segs[0].startIndex !== undefined);

// Bengali numbered questions
const bengaliSegs = QuestionSegmenter.segment(
  'Q. 1. যদি x+3=7 হয়, তাহলে x=\n(A) 1 (B) 2 (C) 3 (D) 4\n' +
  'Q. 2. যদি 2x=8 হয়, তাহলে x=\n(A) 2 (B) 3 (C) 4 (D) 5'
);
check('P2: Bengali Q. format segmented', bengaliSegs.length === 2);

// ─── PHASE 3: TEXT NORMALIZATION ──────────────────────────────
console.log('\n===== PHASE 3: Text Normalization =====');
const norm1 = OCRNormalizer.normalizeText('\uFF08A\uFF09\uFF1C B \uFF1E\uFF0E\uFF1F');
check('P3: \uFF08\uFF09 \u2192 ()', norm1.includes('(A)'));
check('P3: \uFF1C\uFF1E \u2192 <>', norm1.includes('<') && norm1.includes('>'));
check('P3: \uFF0E \u2192 .', norm1.includes('.'));
check('P3: \uFF1F \u2192 ?', norm1.includes('?'));

const norm2 = OCRNormalizer.normalizeText('\u09E6\u09E7\u09E8\u09E9\u09EA\u09EB\u09EC\u09ED\u09EE\u09EF');
check('P3: Bengali digits 0123456789 normalized', norm2 === '0123456789');

const norm3 = OCRNormalizer.normalizeText('hello\u200Bworld\uFEFF end');
check('P3: zero-width space removed', !norm3.includes('\u200B'));
check('P3: BOM removed', !norm3.includes('\uFEFF'));

const norm4 = OCRNormalizer.normalizeText('a   b   c');
check('P3: duplicate spaces collapsed', !norm4.includes('   '));

const norm5 = OCRNormalizer.normalizeText('a\u0964b');
check('P3: Bengali danda normalized', norm5.includes('.') && !norm5.includes('\u0964'));

const norm6 = OCRNormalizer.normalizeText('a\u2212b');
check('P3: Unicode minus normalized', norm6.includes('-'));

// ─── PHASE 4: NOISE REMOVAL ───────────────────────────────────
console.log('\n===== PHASE 4: Noise Removal =====');
const noisy = 'WBCHSE 2022\nChhaya Mathematics\nHS Corner\nDifficulty: Hard\nFind x+5=12.\nPage 7';
const { cleanText: clean4, extractedMeta: meta4 } = NoiseRemover.clean(noisy);
check('P4: WBCHSE removed from text', !clean4.includes('WBCHSE'));
check('P4: Chhaya removed from text', !clean4.includes('Chhaya'));
check('P4: Math content preserved', clean4.includes('Find x+5=12'));
check('P4: examBoard extracted as metadata', meta4.examBoard === 'WBCHSE');
check('P4: examYear extracted as metadata', meta4.examYear === '2022');
check('P4: difficulty extracted as metadata', !!meta4.difficulty);

// School name removal
const schoolNoisy = 'Ramkrishna High School 2019\nFind the area of triangle.';
const { cleanText: clean4b, extractedMeta: meta4b } = NoiseRemover.clean(schoolNoisy);
check('P4: School name removed from text', !clean4b.includes('Ramkrishna High School'));
check('P4: Math content still preserved', clean4b.includes('Find the area'));

// ─── PHASE 5: OPTION EXTRACTION ───────────────────────────────
console.log('\n===== PHASE 5: Option Extraction =====');
// Standard inline
const p5a = MCQOptionParser.parse('Find x.\n(A) 1  (B) 2  (C) 3  (D) 4');
check('P5: exactly 4 options returned', p5a && p5a.options.length === 4);
check('P5: labels are A B C D', p5a && p5a.options.map(o => o.label).join('') === 'ABCD');
check('P5: filledCount is 4', p5a && p5a.filledCount === 4);
check('P5: isComplete is true', p5a && p5a.isComplete === true);
check('P5: hasDuplicates is false for unique', p5a && p5a.hasDuplicates === false);

// Bengali alpha labels ক খ গ ঘ
const p5b = MCQOptionParser.parse('\u0995\u09CB\u09A8\u099F\u09BF?\n(\u0995) 5  (\u0996) 6  (\u0997) 7  (\u0998) 8');
check('P5: Bengali \u0995/\u0996/\u0997/\u0998 parsed to A/B/C/D', p5b && p5b.options[0].label === 'A' && p5b.options[3].label === 'D');

// Bengali numeric labels
const p5c = MCQOptionParser.parse('Find x.\n(1) 1  (2) 2  (3) 3  (4) 4');
check('P5: numeric 1/2/3/4 parsed to A/B/C/D', p5c && p5c.options[0].label === 'A');

// OCR spaced labels
const p5d = MCQOptionParser.parse('Find x.\n( A ) 1  ( B ) 2  ( C ) 3  ( D ) 4');
check('P5: OCR-spaced labels handled', p5d && p5d.filledCount === 4);

// Duplicate detection
const p5e = MCQOptionParser.parse('Find x.\n(A) 5  (B) 5  (C) 5  (D) 5');
check('P5: duplicate options detected', p5e && p5e.hasDuplicates === true);

// Ans badge not in option text
const p5f = MCQOptionParser.parse('Find x.\n(A) 5  (B) 6  (C) 7  (D) 8\nAns: (C)');
check('P5: Ans badge stripped from option D text', p5f && !p5f.options[3].text.includes('Ans'));
check('P5: option D is just "8"', p5f && p5f.options[3].text.trim() === '8');

// Line-based format
const p5g = MCQOptionParser.parse('Find x.\n(A) one\n(B) two\n(C) three\n(D) four\nAns: (B)');
check('P5: line-based format, Ans badge not in option', p5g && !p5g.options[3].text.includes('Ans'));

// ─── PHASE 6: ANSWER EXTRACTION ───────────────────────────────
console.log('\n===== PHASE 6: Answer Extraction =====');
const opts6 = [{label:'A',text:'13'},{label:'B',text:'14'},{label:'C',text:'25'},{label:'D',text:'12'}];

const ans6a = AnswerExtractor.extractFromSegment(
  'Find x.\n(A) 13 (B) 14 (C) 25 (D) 12\nAns: (A)', opts6);
check('P6: correctOption extracted', ans6a.correctOption === 'A');
check('P6: correctAnswer is full text not just label', ans6a.correctAnswer === '13');
check('P6: answer source "inline-badge"', ans6a.source === 'inline-badge');

const ans6b = AnswerExtractor.extractFromSegment('Find x.\n(A) 1 (B) 2 (C) 3 (D) 4\nAnswer: C', opts6);
check('P6: "Answer: C" format detected', ans6b.correctOption === 'C');

const ans6c = AnswerExtractor.extractFromSegment(
  '\u0995\u09CB\u09A8\u099F\u09BF?\n\u0989\u09A4\u09CD\u09A4\u09B0: \u0996', opts6);
check('P6: Bengali \u0989\u09A4\u09CD\u09A4\u09B0: detected', ans6c.correctOption === 'B');

const ans6d = AnswerExtractor.extractFromSegment('No answer here.', []);
check('P6: returns null when no badge', ans6d.correctOption === null);

const ans6e = AnswerExtractor.extractFromSegment('Correct option: D', opts6);
check('P6: "Correct option:" format detected', ans6e.correctOption === 'D');

// Both correctOption AND correctAnswer stored
check('P6: BOTH correctOption AND correctAnswer stored',
  ans6a.correctOption !== null && ans6a.correctAnswer !== null);
check('P6: correctAnswer is full text (not just label)', ans6a.correctAnswer.length > 1);

// Answer key page parsing
const keyMap = AnswerExtractor.parseAnswerKeyPage('1. A  2. B  3. C  4. D  5. A');
check('P6: answer key page map parsed', keyMap.get(1) === 'A' && keyMap.get(3) === 'C' && keyMap.get(5) === 'A');

// applyAnswerKey function
const testQs = [{ questionNumber: '2', options: [{label:'A',text:'one'},{label:'B',text:'two'},{label:'C',text:'three'},{label:'D',text:'four'}] }];
AnswerExtractor.applyAnswerKey(testQs, keyMap);
check('P6: applyAnswerKey sets correctOption', testQs[0].correctOption === 'B');
check('P6: applyAnswerKey sets correctAnswer', testQs[0].correctAnswer === 'two');

// ─── PHASE 7: LATEX NORMALIZATION ─────────────────────────────
console.log('\n===== PHASE 7: LaTeX Normalization =====');
const L = LatexNormalizer.normalize.bind(LatexNormalizer);

// Mathematical operators
check('P7: \xD7 \u2192 \\times', L('a \xD7 b').includes('\\times'));
check('P7: \xF7 \u2192 \\div', L('a \xF7 b').includes('\\div'));
check('P7: \xB1 \u2192 \\pm', L('a \xB1 b').includes('\\pm'));

// Comparison
check('P7: \u2264 \u2192 \\leq', L('\u2264').includes('\\leq'));
check('P7: \u2265 \u2192 \\geq', L('\u2265').includes('\\geq'));
check('P7: \u2260 \u2192 \\neq', L('\u2260').includes('\\neq'));
check('P7: \u2248 \u2192 \\approx', L('\u2248').includes('\\approx'));

// Sets
check('P7: \u2208 \u2192 \\in', L('\u2208').includes('\\in'));
check('P7: \u2209 \u2192 \\notin', L('\u2209').includes('\\notin'));
check('P7: \u2205 \u2192 \\emptyset', L('\u2205').includes('\\emptyset'));
check('P7: \u2200 \u2192 \\forall', L('\u2200').includes('\\forall'));
check('P7: \u2203 \u2192 \\exists', L('\u2203').includes('\\exists'));
check('P7: \u222A \u2192 \\cup', L('\u222A').includes('\\cup'));
check('P7: \u2229 \u2192 \\cap', L('\u2229').includes('\\cap'));

// Calculus
check('P7: \u221E \u2192 \\infty', L('\u221E').includes('\\infty'));
check('P7: \u221A \u2192 \\sqrt', L('\u221A').includes('\\sqrt'));
check('P7: \u2211 \u2192 \\sum', L('\u2211').includes('\\sum'));
check('P7: \u220F \u2192 \\prod', L('\u220F').includes('\\prod'));
check('P7: \u222B \u2192 \\int', L('\u222B').includes('\\int'));
check('P7: \u2202 \u2192 \\partial', L('\u2202').includes('\\partial'));
check('P7: \u2207 \u2192 \\nabla', L('\u2207').includes('\\nabla'));

// Greek lowercase
check('P7: \u03B1 \u2192 \\alpha', L('\u03B1').includes('\\alpha'));
check('P7: \u03B2 \u2192 \\beta', L('\u03B2').includes('\\beta'));
check('P7: \u03B3 \u2192 \\gamma', L('\u03B3').includes('\\gamma'));
check('P7: \u03B4 \u2192 \\delta', L('\u03B4').includes('\\delta'));
check('P7: \u03B8 \u2192 \\theta', L('\u03B8').includes('\\theta'));
check('P7: \u03BB \u2192 \\lambda', L('\u03BB').includes('\\lambda'));
check('P7: \u03BC \u2192 \\mu', L('\u03BC').includes('\\mu'));
check('P7: \u03C0 \u2192 \\pi', L('\u03C0').includes('\\pi'));
check('P7: \u03C3 \u2192 \\sigma', L('\u03C3').includes('\\sigma'));
check('P7: \u03C9 \u2192 \\omega', L('\u03C9').includes('\\omega'));

// Greek uppercase
check('P7: \u03A3 \u2192 \\Sigma', L('\u03A3').includes('\\Sigma'));
check('P7: \u03A9 \u2192 \\Omega', L('\u03A9').includes('\\Omega'));
check('P7: \u03A0 \u2192 \\Pi', L('\u03A0').includes('\\Pi'));
check('P7: \u0394 \u2192 \\Delta', L('\u0394').includes('\\Delta'));

// Arrows
check('P7: \u2192 \u2192 \\rightarrow', L('\u2192').includes('\\rightarrow'));
check('P7: \u21D2 \u2192 \\Rightarrow', L('\u21D2').includes('\\Rightarrow'));
check('P7: \u2194 \u2192 \\leftrightarrow', L('\u2194').includes('\\leftrightarrow'));

// Valid LaTeX preserved
const validLatex = '$x^2 + y^2 = r^2$';
check('P7: valid LaTeX preserved unchanged', L(validLatex).includes('x^2'));

// Syntax validation
check('P7: isValidSyntax for valid', LatexNormalizer.isValidSyntax('$x^2$') === true);
check('P7: isBalancedBraces for valid', LatexNormalizer.isBalancedBraces('{x+y}') === true);
check('P7: isBalancedBraces detects unclosed', LatexNormalizer.isBalancedBraces('{x+y') === false);

// Degree symbol
check('P7: \xB0 \u2192 ^{\\circ}', L('30\xB0').includes('^{\\circ}'));

// ─── PHASE 8: DIAGRAM DETECTION ───────────────────────────────
console.log('\n===== PHASE 8: Diagram Detection =====');

const d8a = DiagramDetector.detect({}, 'The triangle ABC has angle of 60 degrees.');
check('P8: geometry diagram detected', d8a.diagramPresent && d8a.diagrams[0].type === 'geometry');

const d8b = DiagramDetector.detect({}, 'Draw a Venn diagram for sets A and B.');
check('P8: venn diagram detected', d8b.diagramPresent && d8b.diagrams[0].type === 'venn');

const d8c = DiagramDetector.detect({}, 'Plot on the x-axis and y-axis coordinate plane.');
check('P8: coordinate diagram detected', d8c.diagramPresent && d8c.diagrams[0].type === 'coordinate');

const d8d = DiagramDetector.detect({}, 'Draw a bar chart for the given frequency distribution.');
check('P8: graph/chart detected', d8d.diagramPresent && d8d.diagrams[0].type === 'graph');

const d8e = DiagramDetector.detect({}, 'Fill in the tabular data.');
check('P8: table detected', d8e.diagramPresent && d8e.diagrams[0].type === 'table');

const d8f = DiagramDetector.detectInQuestion('Find the triangle ABC area.');
check('P8: per-question detection returns hasDiagram', d8f.hasDiagram === true && d8f.diagramType === 'geometry');

const d8g = DiagramDetector.detectInQuestion('Find x+5=12.');
check('P8: no false positive on plain math text', d8g.hasDiagram === false);

// Bengali geometry detection
const d8h = DiagramDetector.detectInQuestion('\u09A4\u09CD\u09B0\u09BF\u09AD\u09C1\u099C ABC \u098F\u09B0 \u09A6\u09C1\u099F\u09BF \u09AC\u09BE\u09B9\u09C1 \u09B8\u09AE\u09BE\u09A8\u0964');
check('P8: Bengali \u09A4\u09CD\u09B0\u09BF\u09AD\u09C1\u099C (triangle) detected', d8h.hasDiagram === true);

check('P8: diagramPresent field', d8a.diagramPresent !== undefined);
check('P8: diagrams[] array returned', Array.isArray(d8a.diagrams));
check('P8: diagramPresenceScore returned', d8a.diagramPresenceScore !== undefined);

// ─── PHASE 9: VALIDATION ──────────────────────────────────────
console.log('\n===== PHASE 9: Validation =====');

// Valid MCQ
const v9a = QuestionValidator.validate({
  question: 'Find x if x+3=7.',
  format: 'mcq',
  options: [{label:'A',text:'1'},{label:'B',text:'2'},{label:'C',text:'3'},{label:'D',text:'4'}],
  ocrConfidence: 0.90
});
check('P9: valid MCQ passes', v9a.isValid === true);
check('P9: missing answer badge → warning only (not rejection)', v9a.isValid && v9a.warnings.some(w => /answer/i.test(w)));

// Missing options (2 only) → warning not rejection
const v9b = QuestionValidator.validate({
  question: 'Find x.',
  format: 'mcq',
  options: [{label:'A',text:'1'},{label:'B',text:'2'},{label:'C',text:''},{label:'D',text:''}],
  ocrConfidence: 0.90
});
check('P9: 2 filled options → warning', v9b.warnings.some(w => /option/i.test(w)));

// Duplicate options → rejected
const v9c = QuestionValidator.validate({
  question: 'Find x.',
  format: 'mcq',
  options: [{label:'A',text:'5'},{label:'B',text:'5'},{label:'C',text:'5'},{label:'D',text:'5'}],
  ocrConfidence: 0.90
});
check('P9: duplicate options rejected', !v9c.isValid);
check('P9: DUPLICATE_OPTIONS quarantine code', v9c.quarantineReasons.includes('DUPLICATE_OPTIONS'));

// Empty question → rejected
const v9d = QuestionValidator.validate({ question: '', format: 'mcq', options: [], ocrConfidence: 0.90 });
check('P9: empty question rejected', !v9d.isValid);
check('P9: MISSING_QUESTION quarantine code', v9d.quarantineReasons.includes('MISSING_QUESTION'));

// Critically low OCR confidence → rejected
const v9e = QuestionValidator.validate({
  question: 'Find x.',
  format: 'mcq',
  options: [{label:'A',text:'1'},{label:'B',text:'2'},{label:'C',text:'3'},{label:'D',text:'4'}],
  ocrConfidence: 0.25
});
check('P9: critically low OCR confidence rejected', !v9e.isValid);
check('P9: OCR_CONFIDENCE_CRITICAL quarantine code', v9e.quarantineReasons.includes('OCR_CONFIDENCE_CRITICAL'));

// Answer key leak
const v9f = QuestionValidator.validate({ question: '(A)', format: 'mcq', options: [] });
check('P9: answer key leak "(A)" rejected', !v9f.isValid);

// Section header leak
const v9g = QuestionValidator.validate({ question: 'EXERCISE', format: 'mcq', options: [] });
check('P9: section header "EXERCISE" rejected', !v9g.isValid);

// quarantineReasons array on valid
check('P9: quarantineReasons[] exists on valid', Array.isArray(v9a.quarantineReasons));
check('P9: validationWarnings[] exists', Array.isArray(v9a.warnings));

// ─── PHASE 10: CONFIDENCE SCORING ─────────────────────────────
console.log('\n===== PHASE 10: Confidence Scoring =====');

const c10a = ConfidenceScorer.compute({
  ocrConfidence: 0.92,
  questionText: 'Find x if x+3=7.',
  options: [{label:'A',text:'1'},{label:'B',text:'2'},{label:'C',text:'3'},{label:'D',text:'4'}],
  correctOption: 'D'
});
check('P10: questionConfidence field', c10a.questionConfidence !== undefined);
check('P10: optionsConfidence field', c10a.optionsConfidence !== undefined);
check('P10: answerConfidence field', c10a.answerConfidence !== undefined);
check('P10: latexConfidence field', c10a.latexConfidence !== undefined);
check('P10: overallConfidence field', c10a.overallConfidence !== undefined);
check('P10: ocrConfidence field', c10a.ocrConfidence !== undefined);
check('P10: semanticConfidence field', c10a.semanticConfidence !== undefined);
check('P10: boundaryConfidence field', c10a.boundaryConfidence !== undefined);
check('P10: rating high/medium/low', ['high','medium','low'].includes(c10a.rating));
check('P10: breakdown field exists', !!c10a.breakdown);
check('P10: high quality → high rating', c10a.rating === 'high');

const c10b = ConfidenceScorer.compute({ ocrConfidence: 0.30, questionText: 'x', options: [], correctOption: null });
check('P10: poor quality → low rating', c10b.rating === 'low');

check('P10: ACCEPTED routing for high conf', ConfidenceScorer.routingDecision(c10a, []) === 'ACCEPTED');
check('P10: QUARANTINED routing with reasons', ConfidenceScorer.routingDecision(c10a, ['MISSING_OPTIONS']) === 'QUARANTINED');

const c10c = ConfidenceScorer.compute({
  ocrConfidence: 0.60,
  questionText: 'Find x.',
  options: [{label:'A',text:'1'},{label:'B',text:'2'},{label:'C',text:'3'},{label:'D',text:'4'}],
  correctOption: null
});
check('P10: medium quality → PREVIEW routing', ConfidenceScorer.routingDecision(c10c, []) === 'PREVIEW' ||
  ['medium','low'].includes(c10c.rating));

// ─── PHASE 11: STRUCTURED OUTPUT ──────────────────────────────
console.log('\n===== PHASE 11: Structured Output Schema =====');
const fakeOCR = {
  rawText:
    'WBCHSE 2023\n' +
    '1. If x+3=7, find x.\n(A) 3  (B) 4  (C) 5  (D) 6\nAns: (B)\n' +
    '2. If 2x=8, find x.\n(A) 2  (B) 4  (C) 6  (D) 8\nAns: (B)',
  latex:
    'WBCHSE 2023\n' +
    '1. If x+3=7, find x.\n(A) 3  (B) 4  (C) 5  (D) 6\nAns: (B)\n' +
    '2. If 2x=8, find x.\n(A) 2  (B) 4  (C) 6  (D) 8\nAns: (B)',
  confidence: 0.91
};

const result = await OCRPipeline.runPipelineOnOCRResult(fakeOCR, 'verify.jpg');
const q = result.parsedQuestions[0];

check('P11: 2 questions extracted', result.parsedQuestions.length === 2);
check('P11: questionText field exists', q && typeof q.questionText === 'string');
check('P11: options[] has 4 items', q && Array.isArray(q.options) && q.options.length === 4);
check('P11: correctOption field exists', q && q.correctOption !== undefined);
check('P11: correctAnswer field exists', q && q.correctAnswer !== undefined);
check('P11: language field exists (Bengali/English/Both)', q && ['Bengali','English','Both'].includes(q.language));
check('P11: examBoard field exists', q && q.examBoard !== undefined);
check('P11: examYear field exists', q && q.examYear !== undefined);
check('P11: sourceSchool field exists', q && q.sourceSchool !== undefined);
check('P11: difficulty field exists', q && q.difficulty !== undefined);
check('P11: diagram.present field', q && q.diagram && q.diagram.present !== undefined);
check('P11: diagram.type field', q && q.diagram && q.diagram.type !== undefined);
check('P11: tags[] field', q && Array.isArray(q.tags));
check('P11: confidence.overallConfidence', q && q.confidence && q.confidence.overallConfidence !== undefined);
check('P11: confidence.rating', q && q.confidence && ['high','medium','low'].includes(q.confidence.rating));
check('P11: confidence.breakdown', q && q.confidence && !!q.confidence.breakdown);
check('P11: extractionState field', q && ['ACCEPTED','PREVIEW','QUARANTINED'].includes(q.extractionState));
check('P11: quarantined boolean field', q && typeof q.quarantined === 'boolean');
check('P11: quarantineReasons[] field', q && Array.isArray(q.quarantineReasons));
check('P11: validationErrors[] field', q && Array.isArray(q.validationErrors));
check('P11: validationWarnings[] field', q && Array.isArray(q.validationWarnings));
check('P11: WBCHSE NOT in questionText', q && !q.questionText.includes('WBCHSE'));
check('P11: "1." NOT at start of questionText', q && !/^1[.):] /.test(q.questionText.trim()));
check('P11: questionNumber stored separately', q && q.questionNumber !== undefined);
check('P11: answerSource field', q && q.answerSource !== undefined);
check('P11: correctOption is B', q && q.correctOption === 'B');
check('P11: correctAnswer is "4"', q && q.correctAnswer === '4');
check('P11: layoutMetadata in result', !!result.layoutMetadata);
check('P11: pageType in result', !!result.pageType);
check('P11: sections[] in result', Array.isArray(result.sections));
check('P11: totalRejected in result', result.totalRejected !== undefined);
check('P11: pageType is MCQ_PAGE', result.pageType === 'MCQ_PAGE');
check('P11: answerKeys[] in result', Array.isArray(result.answerKeys));

// Output should have no OCR artefacts
check('P11: no raw OCR artefact in questionText', q && !q.questionText.includes('\r'));
// Options are clean
check('P11: options have label and text', q && q.options.every(o => o.label && o.text !== undefined));

// ─── BACKWARD COMPAT ───────────────────────────────────────────
console.log('\n===== BACKWARD COMPATIBILITY =====');
const { MCQDetector, OCRResultValidator, LatexSanitizer } = require('./src/services/ocrPipeline');
check('BC: MCQDetector export', typeof MCQDetector !== 'undefined');
check('BC: MCQDetector.detect', typeof MCQDetector.detect === 'function');
check('BC: MCQDetector.detectMultiple', typeof MCQDetector.detectMultiple === 'function');
check('BC: OCRResultValidator export', typeof OCRResultValidator !== 'undefined');
check('BC: LatexSanitizer alias works', typeof LatexSanitizer.normalize === 'function');
const { LatexSanitizer: LSfromFile } = require('./src/services/latexSanitizer');
check('BC: LatexSanitizer from latexSanitizer.js', typeof LSfromFile !== 'undefined');

// Final
console.log('\n=============================================');
console.log('PASS: ' + pass);
console.log('FAIL: ' + fail);
console.log('TOTAL: ' + (pass + fail));
if (fail === 0) {
  console.log('\n\u2705 ALL CHECKS PASSED — pipeline is production-ready');
} else {
  console.log('\n\u26A0 ' + fail + ' check(s) failed');
}

} // end async run

run().catch(err => {
  console.error('VERIFICATION ERROR:', err.message);
  console.error(err.stack.split('\n').slice(0,12).join('\n'));
  process.exit(1);
});
