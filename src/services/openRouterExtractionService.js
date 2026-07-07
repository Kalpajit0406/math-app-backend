'use strict';

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const mongoose = require('mongoose');

const { GeminiPromptManager } = require('./geminiPromptManager');
const { GeminiResponseParser } = require('./geminiResponseParser');
const { GeminiValidator } = require('./geminiValidator');
const { QuestionDuplicateDetector } = require('./questionDuplicateDetector');

// Dynamic fetch import wrapper
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// Helper to count PDF pages using pdfinfo
function getPdfPageCount(pdfPath) {
  return new Promise((resolve, reject) => {
    exec(`pdfinfo "${pdfPath}"`, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`Failed to read PDF info: ${error.message}`));
      }
      const match = stdout.match(/Pages:\s+(\d+)/);
      if (match) {
        resolve(parseInt(match[1], 10));
      } else {
        reject(new Error('Could not find Page count in pdfinfo output'));
      }
    });
  });
}

// Helper to extract a page as JPEG buffer using pdftoppm
function extractPageAsBuffer(pdfPath, pageNum) {
  return new Promise((resolve, reject) => {
    const tmpBase = path.join(
      path.dirname(pdfPath),
      `import-openrouter-page-${Date.now()}-${pageNum}`
    );
    const cmd = `pdftoppm -jpeg -f ${pageNum} -l ${pageNum} -r 200 -singlefile "${pdfPath}" "${tmpBase}"`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`pdftoppm page ${pageNum} failed: ${error.message}`));
      }
      const jpgPath = `${tmpBase}.jpg`;
      if (!fs.existsSync(jpgPath)) {
        return reject(new Error(`pdftoppm output not found: ${jpgPath}`));
      }
      try {
        const buffer = fs.readFileSync(jpgPath);
        fs.unlinkSync(jpgPath); // clean up immediately
        resolve(buffer);
      } catch (e) {
        reject(e);
      }
    });
  });
}

class OpenRouterExtractionService {
  /**
   * Helper to call OpenRouter API with prompt and image
   * @param {Buffer} buffer - Image buffer
   * @param {string} mimetype - Image mime type
   * @param {string} prompt - Gemini prompt instructions
   * @returns {Promise<string>} Response text from OpenRouter
   */
  static async callOpenRouterAPI(buffer, mimetype, prompt) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured on the backend. Please add it to your environment variables.');
    }

    const model = process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free';
    const apiUrl = 'https://openrouter.ai/api/v1/chat/completions';

    const finalMime = (mimetype === 'application/octet-stream' || !mimetype) ? 'image/jpeg' : mimetype;
    const base64Data = buffer.toString('base64');

    const requestBody = {
      model: model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${finalMime};base64,${base64Data}`
              }
            }
          ]
        }
      ],
      temperature: 0.1
    };

    const startTime = Date.now();
    console.log(`[OpenRouterExtractionService] Requesting OpenRouter API (${model})...`);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://mathswithsd.com',
        'X-Title': 'MathsWithSD'
      },
      body: JSON.stringify(requestBody)
    });

    const responseTime = Date.now() - startTime;
    console.log(`[OpenRouterExtractionService] OpenRouter API responded in ${responseTime}ms`);

    if (!response.ok) {
      const errText = await response.text();
      console.error('[OpenRouterExtractionService] API failure:', errText);
      throw new Error(`OpenRouter API returned error: ${response.statusText} (${response.status}) - ${errText}`);
    }

    const resJson = await response.json();
    const outputText = resJson?.choices?.[0]?.message?.content;
    
    if (!outputText) {
      console.error('[OpenRouterExtractionService] Empty choices response:', JSON.stringify(resJson));
      throw new Error('OpenRouter API returned an empty completion result.');
    }

    return outputText;
  }

  /**
   * Extract questions from a single image buffer
   */
  static async extractFromBuffer(buffer, mimetype, classNo = 12, chapterName = 'General') {
    const { prompt } = GeminiPromptManager.getPrompt();
    const rawResponse = await this.callOpenRouterAPI(buffer, mimetype, prompt);
    
    const parsedQuestions = GeminiResponseParser.parse(rawResponse);
    const validatedQuestions = [];
    const minConfidence = parseFloat(process.env.GEMINI_MIN_CONFIDENCE || '0.60');

    // Load dynamic class cache mapper
    const { resolveClassAndChapter } = require('./importParserService');
    const resolvedClassChapter = await resolveClassAndChapter(classNo, chapterName);

    for (let idx = 0; idx < parsedQuestions.length; idx++) {
      const q = parsedQuestions[idx];
      const validation = GeminiValidator.validateQuestion(q, minConfidence);

      const normalizedText = (q.questionText || q.question || '').trim();
      const optionsArray = Array.isArray(q.options) ? q.options.map(o => String(o || '').trim()) : ['', '', '', ''];
      while (optionsArray.length < 4) optionsArray.push('');

      // Run duplicate check
      const dupCheck = await QuestionDuplicateDetector.checkDuplicate(
        normalizedText,
        resolvedClassChapter.classNo,
        optionsArray,
        q.correctAnswer || q.correctOption || ''
      );

      const qHash = QuestionDuplicateDetector.hash(QuestionDuplicateDetector.normalize(normalizedText));
      const cHash = QuestionDuplicateDetector.contentHash({
        question: normalizedText,
        options: optionsArray,
        correctAnswer: q.correctAnswer || q.correctOption || ''
      });

      validatedQuestions.push({
        questionNumber: q.questionNumber || String(idx + 1),
        questionText: normalizedText,
        options: optionsArray,
        correctOption: q.correctOption || null,
        correctAnswer: q.correctAnswer || '',
        explanation: q.explanation || '',
        language: q.language || 'English',
        className: String(resolvedClassChapter.classNo),
        chapterName: resolvedClassChapter.chapterName,
        classId: resolvedClassChapter.classId,
        chapterId: resolvedClassChapter.chapterId,
        confidence: q.confidence !== undefined ? parseFloat(q.confidence) : 1.0,
        latex: !!q.latex,
        diagramPresent: !!q.diagramPresent,
        diagramDescription: q.diagramDescription || '',
        tags: q.tags || [],
        estimatedTime: q.estimatedTime || '',
        validationErrors: validation.errors,
        isValid: validation.isValid,
        duplicateFound: dupCheck.duplicateDetected,
        duplicateQuestionId: dupCheck.existingQuestion ? dupCheck.existingQuestion._id : null,
        questionHash: qHash,
        contentHash: cHash
      });
    }

    return validatedQuestions;
  }

  /**
   * Extract questions from a multi-page PDF document
   */
  static async extractFromPdfPath(pdfPath, classNo = 12, chapterName = 'General') {
    if (!pdfPath || !fs.existsSync(pdfPath)) {
      throw new Error('PDF file path not found or invalid.');
    }

    const pageCount = await getPdfPageCount(pdfPath);
    console.log(`[OpenRouterExtractionService] Processing PDF: ${pdfPath} (${pageCount} pages)`);
    
    let allQuestions = [];
    
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      console.log(`[OpenRouterExtractionService] Processing page ${pageNum}/${pageCount}`);
      try {
        const pageBuffer = await extractPageAsBuffer(pdfPath, pageNum);
        const pageQuestions = await this.extractFromBuffer(pageBuffer, 'image/jpeg', classNo, chapterName);
        
        for (const q of pageQuestions) {
          q.pageNumber = pageNum;
          allQuestions.push(q);
        }
      } catch (err) {
        console.error(`[OpenRouterExtractionService] Page ${pageNum} processing failed:`, err.message);
      }
    }

    allQuestions.forEach((q, idx) => {
      q.detectionOrder = idx + 1;
    });

    return allQuestions;
  }
}

module.exports = { OpenRouterExtractionService };
