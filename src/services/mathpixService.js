const FormData = require('form-data');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

/**
 * MathpixService — multipart FormData upload approach (from reference backend).
 * Sends image buffer directly to Mathpix v3/text endpoint.
 * Uses only basic compatible options to avoid 400 errors.
 */
class MathpixService {
  /**
   * @param {Buffer} imageBuffer - Raw image bytes from multer memoryStorage
   * @param {string} mimetype    - MIME type (e.g. 'image/jpeg')
   * @param {string} filename    - Original filename for multipart field
   */
  static async processBuffer(imageBuffer, mimetype, filename = 'image.jpg') {
    const appId = process.env.MATHPIX_API_ID;
    const appKey = process.env.MATHPIX_API_KEY;

    if (!appId || !appKey) {
      throw new Error('Mathpix API credentials are not configured in environment variables.');
    }
    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error('Empty image buffer provided.');
    }

    console.log(`[MathpixService] Processing: ${filename} (${(imageBuffer.length / 1024).toFixed(1)} KB, ${mimetype})`);

    // Only BASIC compatible options — avoids 400 from unsupported data_options
    const optionsJson = JSON.stringify({
      formats: ['text', 'html'],
      math_inline_delimiters: ['$', '$'],
      rm_spaces: true,
    });

    const maxRetries = 3;
    let attempt = 0;
    let delay = 1500;

    while (attempt < maxRetries) {
      attempt++;
      try {
        console.log(`[MathpixService] Attempt ${attempt}/${maxRetries}`);

        // Build a fresh FormData for each attempt (streams are consumed)
        const form = new FormData();
        form.append('file', imageBuffer, {
          filename,
          contentType: mimetype,
          knownLength: imageBuffer.length,
        });
        form.append('options_json', optionsJson);

        const response = await fetch('https://api.mathpix.com/v3/text', {
          method: 'POST',
          headers: {
            ...form.getHeaders(),
            'app_id': appId,
            'app_key': appKey,
          },
          body: form,
          timeout: 60000,
        });

        const result = await response.json();

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
        console.warn(`[MathpixService] Attempt ${attempt} failed: ${err.message}`);
        if (attempt >= maxRetries) {
          throw new Error(`Mathpix API exhausted ${maxRetries} attempts. Last error: ${err.message}`);
        }
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
      }
    }
  }
}

module.exports = { MathpixService };
