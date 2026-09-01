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
      `import-gemini-page-${Date.now()}-${pageNum}`
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

class GeminiExtractionService {
  /**
   * Helper to call Google Gemini API with prompt and image
   * @param {Buffer} buffer - Image buffer
   * @param {string} mimetype - Image mime type
   * @param {string} prompt - Gemini prompt instructions
   * @returns {Promise<string>} Response text from Gemini
   */
  static async callGeminiAPI(buffer, mimetype, prompt, apiKeyToUse = null) {
    const apiKey = apiKeyToUse || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured on the backend. Please add it to your environment variables.');
    }

    const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
    const apiVersion = process.env.GEMINI_API_VERSION || 'v1beta';
    const apiUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${apiKey}`;

    const maxAttempts = 3;
    let attempt = 0;
    let delay = 1000;

    while (attempt < maxAttempts) {
      const startTime = Date.now();
      console.log(`[GeminiExtractionService] Requesting Gemini API (${model}), attempt ${attempt + 1}/${maxAttempts}...`);
      try {
        let contentPart;

        if (mimetype === 'application/pdf') {
          console.log(`[GeminiExtractionService] Uploading PDF via Google Files API...`);
          const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;
          const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
              'X-Goog-Upload-Protocol': 'raw',
              'X-Goog-Upload-Header-Content-Length': buffer.length,
              'X-Goog-Upload-Header-Content-Type': mimetype,
              'Content-Type': mimetype,
            },
            body: buffer,
          });

          if (!uploadResponse.ok) {
            const uploadErr = await uploadResponse.text();
            throw new Error(`Google Files API upload failed: ${uploadResponse.status} - ${uploadErr}`);
          }

          const uploadResult = await uploadResponse.json();
          const fileUri = uploadResult.file?.uri;
          const fileName = uploadResult.file?.name;

          if (!fileUri || !fileName) {
            throw new Error('Google Files API returned invalid file upload result.');
          }

          console.log(`[GeminiExtractionService] PDF uploaded. URI: ${fileUri}. Polling status...`);

          let fileState = uploadResult.file?.state;
          const fileStatusUrl = `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`;
          let pollAttempts = 0;
          while (fileState === 'PROCESSING' && pollAttempts < 15) {
            await new Promise(resolve => setTimeout(resolve, 1500));
            pollAttempts++;
            const statusResponse = await fetch(fileStatusUrl);
            if (statusResponse.ok) {
              const statusData = await statusResponse.json();
              fileState = statusData.state;
              console.log(`[GeminiExtractionService] PDF status check: ${fileState}`);
            } else {
              break;
            }
          }

          if (fileState !== 'ACTIVE') {
            throw new Error(`PDF upload failed processing with state: ${fileState}`);
          }

          contentPart = {
            fileData: {
              mimeType: mimetype,
              fileUri: fileUri
            }
          };
        } else {
          contentPart = {
            inlineData: {
              mimeType: (mimetype === 'application/octet-stream' || !mimetype) ? 'image/jpeg' : mimetype,
              data: buffer.toString('base64')
            }
          };
        }

        const requestBody = {
          contents: [
            {
              parts: [
                {
                  text: prompt
                },
                contentPart
              ]
            }
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1
          }
        };

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        const responseTime = Date.now() - startTime;
        console.log(`[GeminiExtractionService] Gemini API responded in ${responseTime}ms`);

        if (!response.ok) {
          const errText = await response.text();
          console.error(`[GeminiExtractionService] API failure (status ${response.status}):`, errText);
          
          if ([429, 500, 503].includes(response.status) && attempt < maxAttempts - 1) {
            attempt++;
            console.warn(`[GeminiExtractionService] Retriable status ${response.status}. Waiting ${delay}ms before retry ${attempt + 1}/${maxAttempts}...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
            continue;
          }
          throw new Error(`Gemini API returned error: ${response.statusText} (${response.status}) - ${errText}`);
        }

        const resJson = await response.json();
        const outputText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
        const finishReason = resJson?.candidates?.[0]?.finishReason;

        if (!outputText) {
          console.error('[GeminiExtractionService] Empty candidate response:', JSON.stringify(resJson));
          throw new Error('Gemini API returned an empty completion result.');
        }

        // CRITICAL: Detect output truncation. When the model runs out of output
        // tokens mid-document (very likely for dense multi-page/multi-section
        // question papers), Gemini's JSON mode often force-closes the array to
        // stay syntactically valid — so JSON.parse() succeeds but SILENTLY DROPS
        // every question after the cut point. That looks like a normal success
        // to the caller, so it never triggers the safer page-by-page fallback.
        // We must surface truncation as an error so extractFromPdfPath() falls
        // back to per-page extraction instead of accepting a partial result.
        if (finishReason === 'MAX_TOKENS') {
          console.error(`[GeminiExtractionService] Response TRUNCATED (finishReason=MAX_TOKENS). Output was cut off — questions after the cut point are missing.`);
          throw new Error('Gemini API output was truncated (MAX_TOKENS) — response is incomplete.');
        }

        // Clean up uploaded file in background (non-blocking)
        if (mimetype === 'application/pdf' && fileName) {
          const deleteUrl = `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`;
          fetch(deleteUrl, { method: 'DELETE' })
            .then(res => {
              if (res.ok) console.log(`[GeminiExtractionService] Successfully deleted temporary PDF file: ${fileName}`);
            })
            .catch(e => console.warn(`[GeminiExtractionService] Failed to delete temporary PDF file: ${e.message}`));
        }

        return outputText;

      } catch (err) {
        if (attempt < maxAttempts - 1) {
          attempt++;
          console.warn(`[GeminiExtractionService] Error during call: ${err.message}. Waiting ${delay}ms before retry ${attempt + 1}/${maxAttempts}...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2;
          continue;
        }
        throw err;
      }
    }
  }

  /**
   * Extract questions from a single image buffer
   */
  static async extractFromBuffer(buffer, mimetype, classNo = 12, chapterName = 'General') {
    const { prompt } = GeminiPromptManager.getPrompt();
    
    let rawResponse;
    let backupKeyUsed = false;

    try {
      rawResponse = await this.callGeminiAPI(buffer, mimetype, prompt);
    } catch (err) {
      console.warn(`[GeminiExtractionService] Primary Gemini API key failed: ${err.message}. Trying backup API key...`);
      const backupKey = process.env.GEMINI_API_KEY_BACKUP;
      if (!backupKey) {
        throw new Error(`Primary API key failed (${err.message}) and no backup key (GEMINI_API_KEY_BACKUP) is configured.`);
      }
      try {
        rawResponse = await this.callGeminiAPI(buffer, mimetype, prompt, backupKey);
        backupKeyUsed = true;
        console.log(`[GeminiExtractionService] Backup Gemini API key call succeeded.`);
      } catch (backupErr) {
        console.error(`[GeminiExtractionService] Backup Gemini API key also failed: ${backupErr.message}`);
        throw new Error(`Both primary API key (${err.message}) and backup API key (${backupErr.message}) failed.`);
      }
    }
    
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
        duplicateQuestionId: dupCheck.existingQuestion ? dupCheck.existingQuestion._id : null
      });
    }

    validatedQuestions.backupKeyUsed = backupKeyUsed;
    return validatedQuestions;
  }

  /**
   * Extract questions from a multi-page PDF document
   */
  static async extractFromPdfPath(pdfPath, classNo = 12, chapterName = 'General') {
    if (!pdfPath || !fs.existsSync(pdfPath)) {
      throw new Error('PDF file path not found or invalid.');
    }

    try {
      console.log(`[GeminiExtractionService] Attempting native PDF extraction for: ${pdfPath}`);
      const buffer = fs.readFileSync(pdfPath);
      // Process PDF natively via direct Gemini call (mimeType: 'application/pdf')
      const questions = await this.extractFromBuffer(buffer, 'application/pdf', classNo, chapterName);
      console.log(`[GeminiExtractionService] Native PDF extraction succeeded. Found ${questions.length} questions.`);

      // SANITY CHECK: a single Gemini call is asked to enumerate every question
      // across the whole document. For multi-page question papers, returning
      // fewer questions than there are pages is a strong signal the model
      // stopped early / summarized instead of listing every question (this can
      // happen even without a hard MAX_TOKENS cutoff). Page-by-page extraction
      // is far more reliable, so treat implausibly low yields as a failure and
      // fall back rather than silently accepting an incomplete result.
      let pageCount = 1;
      try {
        pageCount = await getPdfPageCount(pdfPath);
      } catch (_) { /* best-effort; skip the sanity check if page count is unavailable */ }

      if (pageCount >= 2 && questions.length < pageCount) {
        throw new Error(`Implausibly few questions extracted (${questions.length}) for a ${pageCount}-page document — likely incomplete/summarized output.`);
      }

      return questions;
    } catch (nativeErr) {
      console.warn(`[GeminiExtractionService] Native PDF extraction failed or incomplete: ${nativeErr.message}. Falling back to page-by-page pdftoppm rendering...`);
      return this.extractFromPdfPathFallback(pdfPath, classNo, chapterName);
    }
  }

  /**
   * Extract questions from a multi-page PDF document using pdftoppm fallback
   */
  static async extractFromPdfPathFallback(pdfPath, classNo = 12, chapterName = 'General') {
    const pageCount = await getPdfPageCount(pdfPath);
    console.log(`[GeminiExtractionService] Processing PDF fallback: ${pdfPath} (${pageCount} pages)`);
    
    let allQuestions = [];
    let backupKeyUsed = false;
    
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      console.log(`[GeminiExtractionService] Processing page ${pageNum}/${pageCount}`);
      try {
        const pageBuffer = await extractPageAsBuffer(pdfPath, pageNum);
        const pageQuestions = await this.extractFromBuffer(pageBuffer, 'image/jpeg', classNo, chapterName);
        if (pageQuestions.backupKeyUsed) {
          backupKeyUsed = true;
        }
        
        // Merge & adjust sequence numbering
        for (const q of pageQuestions) {
          q.pageNumber = pageNum;
          allQuestions.push(q);
        }
      } catch (err) {
        console.error(`[GeminiExtractionService] Page ${pageNum} processing failed:`, err.message);
        // Continue to next page so we don't abort the entire document
      }
    }

    // Re-index question sequence numbers to keep them unique
    allQuestions.forEach((q, idx) => {
      q.detectionOrder = idx + 1;
    });

    allQuestions.backupKeyUsed = backupKeyUsed;
    return allQuestions;
  }
}

module.exports = { GeminiExtractionService };
