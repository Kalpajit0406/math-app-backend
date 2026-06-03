const FormData = require('form-data');
const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const OCR_TIMEOUT_MS = Number.parseInt(process.env.OCR_TIMEOUT_MS || '20000', 10);
const OCR_MAX_RETRIES = Number.parseInt(process.env.OCR_MAX_RETRIES || '2', 10);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * MathpixService — multipart FormData upload approach.
 * Sends image buffer or file path directly to Mathpix v3/text endpoint.
 */
class MathpixService {
  /**
   * @param {Buffer|string} imageBufferOrPath - Raw image bytes or file path on disk
   * @param {string} mimetype                 - MIME type (e.g. 'image/jpeg')
   * @param {string} filename                 - Original filename for multipart field
   */
  static async processBuffer(imageBufferOrPath, mimetype, filename = 'image.jpg') {
    const appId = process.env.MATHPIX_API_ID;
    const appKey = process.env.MATHPIX_API_KEY;

    if (!appId || !appKey) {
      throw new Error('Mathpix API credentials are not configured in environment variables.');
    }

    const isPath = typeof imageBufferOrPath === 'string';
    let fileLength = 0;

    if (isPath) {
      if (!fs.existsSync(imageBufferOrPath)) {
        throw new Error(`File not found on disk: ${imageBufferOrPath}`);
      }
      fileLength = fs.statSync(imageBufferOrPath).size;
      console.log(`[MathpixService] Processing file path: ${imageBufferOrPath} (${(fileLength / 1024).toFixed(1)} KB, ${mimetype})`);
    } else {
      if (!imageBufferOrPath || imageBufferOrPath.length === 0) {
        throw new Error('Empty image buffer provided.');
      }
      fileLength = imageBufferOrPath.length;
      console.log(`[MathpixService] Processing buffer: ${filename} (${(fileLength / 1024).toFixed(1)} KB, ${mimetype})`);
    }

    // Only BASIC compatible options — avoids 400 from unsupported data_options
    const optionsJson = JSON.stringify({
      formats: ['text', 'html'],
      math_inline_delimiters: ['$', '$'],
      rm_spaces: true,
    });

    const maxRetries = OCR_MAX_RETRIES;
    let attempt = 0;
    let delay = 1500;

    while (attempt < maxRetries) {
      attempt++;
      try {
        console.log(`[MathpixService] Attempt ${attempt}/${maxRetries}`);

        // Build a fresh FormData for each attempt (streams are consumed)
        const form = new FormData();
        const fileSource = isPath ? fs.createReadStream(imageBufferOrPath) : imageBufferOrPath;
        form.append('file', fileSource, {
          filename,
          contentType: mimetype,
          knownLength: fileLength,
        });
        form.append('options_json', optionsJson);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);

        const requestStartedAt = Date.now();
        let response;
        try {
          response = await fetch('https://api.mathpix.com/v3/text', {
            method: 'POST',
            headers: {
              ...form.getHeaders(),
              'app_id': appId,
              'app_key': appKey,
            },
            body: form,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        console.log(`[MathpixService] Mathpix response received in ${Date.now() - requestStartedAt}ms`);

        const responseText = await response.text();
        let result;
        try {
          result = JSON.parse(responseText);
        } catch (parseErr) {
          throw new Error(`Mathpix returned non-JSON response: ${responseText.substring(0, 120)}`);
        }

        console.log(`[MathpixService] Status: ${response.status}`, {
          hasText: !!result.text,
          textLen: result.text?.length || 0,
          hasError: !!result.error,
          confidence: result.confidence,
        });

        if (!response.ok) {
          const errMsg = result?.error || result?.message || `HTTP ${response.status}`;
          throw new Error(`Mathpix API error ${response.status}: ${errMsg}`);
        }

        if (result.error) {
          // API-level error inside a 200 OK response (e.g. image_no_content)
          const errId = result.error_info?.id || result.error;
          const errMsg = result.error_info?.message || result.error;
          console.warn(`[MathpixService] API-level error: ${errId} — ${errMsg}`);
          throw new Error(`Mathpix: ${errMsg}`);
        }

        // Strip HTML tags for plain text fallback
        const strippedHtml = (result.html || '')
          .replace(/<[^>]*>/g, '')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
          .replace(/\s+/g, ' ').trim();

        const rawText = result.text || strippedHtml;
        const latex = result.latex_styled || result.text || '';

        console.log(`[MathpixService] Success — rawText: ${rawText.length} chars, latex: ${latex.length} chars`);
        return { rawText, latex, confidence: result.confidence ?? null };

      } catch (err) {
        if (err.name === 'AbortError') {
          console.warn(`[MathpixService] Attempt ${attempt} timed out after ${OCR_TIMEOUT_MS}ms`);
        } else {
          console.warn(`[MathpixService] Attempt ${attempt} failed: ${err.message}`);
        }

        if (attempt >= maxRetries) {
          if (err.name === 'AbortError') {
            throw new Error(`Mathpix API timed out after ${OCR_TIMEOUT_MS}ms (${maxRetries} attempts)`);
          }
          throw new Error(`Mathpix API exhausted ${maxRetries} attempts. Last error: ${err.message}`);
        }

        await sleep(delay);
        delay *= 2;
      }
    }
  }
}

module.exports = { MathpixService };
