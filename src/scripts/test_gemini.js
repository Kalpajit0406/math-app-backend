'use strict';

console.log('--- STARTING GEMINI EXTRACTION ENGINE SANITY CHECKS ---');

try {
  const { GeminiPromptManager } = require('../services/geminiPromptManager');
  const { GeminiResponseParser } = require('../services/geminiResponseParser');
  const { GeminiValidator } = require('../services/geminiValidator');
  const { GeminiExtractionService } = require('../services/geminiExtractionService');
  const geminiImportController = require('../controllers/geminiImportController');
  const geminiImportRoutes = require('../routes/geminiImportRoutes');
  const { MathpixEngine, GeminiEngine } = require('../services/extractionEngine');

  console.log('✅ All imports loaded successfully.');

  // Test 1: Prompt manager
  const promptData = GeminiPromptManager.getPrompt();
  if (promptData && promptData.version === '1.0.0' && promptData.prompt.includes('latex')) {
    console.log('✅ GeminiPromptManager test passed.');
  } else {
    throw new Error('GeminiPromptManager returned invalid structure');
  }

  // Test 2: Response parser
  const sampleRawText = `
Here is the JSON response:
\`\`\`json
[
  {
    "questionNumber": "1",
    "questionText": "What is $2+2$?",
    "options": ["3", "4", "5", "6"],
    "correctOption": "B",
    "correctAnswer": "4",
    "explanation": "Simple arithmetic",
    "language": "English",
    "difficulty": "easy",
    "latex": true,
    "diagramPresent": false,
    "diagramDescription": "",
    "tags": ["math"],
    "estimatedTime": "1 min",
    "confidence": 0.95
  }
]
\`\`\`
  `;
  const parsed = GeminiResponseParser.parse(sampleRawText);
  if (Array.isArray(parsed) && parsed.length === 1 && parsed[0].questionNumber === '1') {
    console.log('✅ GeminiResponseParser test passed.');
  } else {
    throw new Error('GeminiResponseParser failed to parse markdown json block');
  }

  // Test 3: Validator
  const validationResult = GeminiValidator.validateQuestion(parsed[0], 0.60);
  if (validationResult.isValid && validationResult.errors.length === 0) {
    console.log('✅ GeminiValidator test passed on valid question.');
  } else {
    throw new Error('GeminiValidator failed to validate correct question');
  }

  const invalidQ = {
    questionText: '',
    options: ['A', 'B'],
    confidence: 0.1
  };
  const validationResultInvalid = GeminiValidator.validateQuestion(invalidQ, 0.60);
  if (!validationResultInvalid.isValid && validationResultInvalid.errors.length > 0) {
    console.log('✅ GeminiValidator test passed on invalid question (properly rejected).');
  } else {
    throw new Error('GeminiValidator accepted an invalid question');
  }

  // Test 4: Extensibility Engines
  const mathpix = new MathpixEngine();
  const gemini = new GeminiEngine();
  if (typeof mathpix.extract === 'function' && typeof gemini.extract === 'function') {
    console.log('✅ Extensibility engines test passed.');
  } else {
    throw new Error('Extensibility engines mismatch');
  }

  console.log('\n🎉 ALL GEMINI SANITY TESTS PASSED SUCCESSFULLY! 🎉');
  process.exit(0);

} catch (err) {
  console.error('\n❌ SANITY CHECKS FAILED:', err.stack);
  process.exit(1);
}
