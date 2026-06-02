const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

/**
 * Mathpix PDF Processing Service
 * Handles PDF, DOCX, PPTX, EPUB and other document formats
 * 
 * Features:
 * - Async PDF processing with polling
 * - Streaming for real-time page results
 * - Multi-page extraction
 * - Format conversion (DOCX, LaTeX, HTML, etc)
 * - Page range selection
 * - Data retention management
 */
class MathpixPdfService {
  constructor(
    appId = process.env.MATHPIX_APP_ID || process.env.MATHPIX_API_ID,
    appKey = process.env.MATHPIX_APP_KEY || process.env.MATHPIX_API_KEY
  ) {
    this.appId = appId;
    this.appKey = appKey;
    this.baseUrl = 'https://api.mathpix.com/v3';
    this.pollingInterval = 1000; // 1 second
    this.maxPollingAttempts = 600; // 10 minutes max
  }

  /**
   * Submit PDF via URL for processing
   * @param {string} url - URL to PDF
   * @param {object} options - Processing options
   * @returns {Promise<string>} pdf_id
   */
  async submitPdfByUrl(url, options = {}) {
    const {
      conversionFormats = {},
      pageRanges = null,
      streaming = false,
      improveMode = false
    } = options;

    const body = {
      url,
      ...this._buildConversionFormats(conversionFormats),
      ...(pageRanges && { page_ranges: pageRanges }),
      ...(streaming && { streaming: true }),
      ...(improveMode && { improve_mathpix: true })
    };

    try {
      const response = await fetch(`${this.baseUrl}/pdf`, {
        method: 'POST',
        headers: {
          'app_id': this.appId,
          'app_key': this.appKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`Mathpix PDF API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.pdf_id;
    } catch (error) {
      throw new Error(`Failed to submit PDF by URL: ${error.message}`);
    }
  }

  /**
   * Submit PDF via file upload for processing
   * @param {Buffer} fileBuffer - PDF file buffer
   * @param {string} filename - Original filename
   * @param {object} options - Processing options
   * @returns {Promise<string>} pdf_id
   */
  async submitPdfByBuffer(fileBuffer, filename = 'document.pdf', options = {}) {
    const {
      conversionFormats = {},
      pageRanges = null,
      streaming = false,
      improveMode = false
    } = options;

    const form = new FormData();
    form.append('file', fileBuffer, filename);

    // Convert options to JSON string for multipart upload
    const optionsJson = {
      ...this._buildConversionFormats(conversionFormats),
      ...(pageRanges && { page_ranges: pageRanges }),
      ...(streaming && { streaming: true }),
      ...(improveMode && { improve_mathpix: true })
    };

    form.append('options_json', JSON.stringify(optionsJson));

    try {
      const response = await fetch(`${this.baseUrl}/pdf`, {
        method: 'POST',
        headers: {
          'app_id': this.appId,
          'app_key': this.appKey,
          ...form.getHeaders()
        },
        body: form
      });

      if (!response.ok) {
        throw new Error(`Mathpix PDF API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.pdf_id;
    } catch (error) {
      throw new Error(`Failed to submit PDF by buffer: ${error.message}`);
    }
  }

  /**
   * Submit PDF from file path
   * @param {string} filePath - Path to PDF file
   * @param {object} options - Processing options
   * @returns {Promise<string>} pdf_id
   */
  async submitPdfByPath(filePath, options = {}) {
    const fileBuffer = fs.readFileSync(filePath);
    const filename = path.basename(filePath);
    return this.submitPdfByBuffer(fileBuffer, filename, options);
  }

  /**
   * Poll for PDF processing status
   * @param {string} pdfId - PDF ID from submit
   * @returns {Promise<object>} Status with {status, num_pages, num_pages_completed, percent_done}
   */
  async getPdfStatus(pdfId) {
    try {
      const response = await fetch(`${this.baseUrl}/pdf/${pdfId}`, {
        headers: {
          'app_id': this.appId,
          'app_key': this.appKey
        }
      });

      if (!response.ok) {
        throw new Error(`Mathpix API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      throw new Error(`Failed to get PDF status: ${error.message}`);
    }
  }

  /**
   * Get conversion status for specific formats
   * @param {string} pdfId - PDF ID
   * @returns {Promise<object>} Conversion status per format
   */
  async getConversionStatus(pdfId) {
    try {
      const response = await fetch(`${this.baseUrl}/pdf/${pdfId}`, {
        headers: {
          'app_id': this.appId,
          'app_key': this.appKey
        }
      });

      if (!response.ok) {
        throw new Error(`Mathpix API error: ${response.status}`);
      }

      const data = await response.json();
      return data.conversion_status || {};
    } catch (error) {
      throw new Error(`Failed to get conversion status: ${error.message}`);
    }
  }

  /**
   * Poll until PDF processing completes
   * @param {string} pdfId - PDF ID
   * @param {number} maxWaitMs - Max wait time in milliseconds
   * @returns {Promise<object>} Final status when completed
   */
  async waitUntilComplete(pdfId, maxWaitMs = 600000) {
    const startTime = Date.now();
    let attempts = 0;

    while (Date.now() - startTime < maxWaitMs && attempts < this.maxPollingAttempts) {
      try {
        const status = await this.getPdfStatus(pdfId);

        if (status.status === 'completed') {
          return status;
        }

        // Wait before next poll (exponential backoff: 1s, 2s, 4s, max 10s)
        const delay = Math.min(1000 * Math.pow(1.5, Math.floor(attempts / 5)), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
        attempts++;
      } catch (error) {
        console.error(`Error polling PDF ${pdfId}:`, error.message);
        // Continue polling despite errors
        await new Promise(resolve => setTimeout(resolve, this.pollingInterval));
      }
    }

    throw new Error(`PDF processing timeout after ${maxWaitMs}ms`);
  }

  /**
   * Stream PDF pages as server-sent events
   * @param {string} pdfId - PDF ID
   * @param {Function} onPage - Callback for each page: (pageData, pageNumber)
   * @param {Function} onError - Error callback
   */
  async streamPdfPages(pdfId, onPage, onError) {
    try {
      const response = await fetch(`${this.baseUrl}/pdf/${pdfId}/stream`, {
        headers: {
          'app_id': this.appId,
          'app_key': this.appKey
        }
      });

      if (!response.ok) {
        throw new Error(`Mathpix API error: ${response.status}`);
      }

      const textStream = response.body;
      let buffer = '';

      textStream.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.trim() && !line.startsWith(':')) {
            try {
              // Handle SSE format: "data: {...}"
              const dataStr = line.replace(/^data:\s*/, '');
              const pageData = JSON.parse(dataStr);
              onPage(pageData, pageData.page_number);
            } catch (err) {
              // Skip non-JSON lines
            }
          }
        }
      });

      textStream.on('end', () => {
        if (buffer.trim()) {
          try {
            const pageData = JSON.parse(buffer.replace(/^data:\s*/, ''));
            onPage(pageData, pageData.page_number);
          } catch (err) {
            // Ignore parse errors at stream end
          }
        }
      });

      textStream.on('error', (error) => {
        if (onError) onError(error);
      });
    } catch (error) {
      if (onError) onError(error);
      throw error;
    }
  }

  /**
   * Download PDF processing result as specific format
   * @param {string} pdfId - PDF ID
   * @param {string} format - Format: 'mmd', 'docx', 'html', 'tex.zip', 'lines_json'
   * @returns {Promise<Buffer>} File content as buffer
   */
  async downloadResult(pdfId, format = 'mmd') {
    const formatMap = {
      'mmd': 'mmd',
      'markdown': 'mmd',
      'docx': 'docx',
      'html': 'html',
      'latex': 'tex.zip',
      'tex': 'tex.zip',
      'lines': 'lines_json',
      'json': 'lines_json'
    };

    const actualFormat = formatMap[format] || format;

    try {
      const response = await fetch(`${this.baseUrl}/pdf/${pdfId}.${actualFormat}`, {
        headers: {
          'app_id': this.appId,
          'app_key': this.appKey
        }
      });

      if (!response.ok) {
        throw new Error(`Mathpix API error: ${response.status}`);
      }

      return await response.buffer();
    } catch (error) {
      throw new Error(`Failed to download ${format} result: ${error.message}`);
    }
  }

  /**
   * Download result and save to file
   * @param {string} pdfId - PDF ID
   * @param {string} format - Format type
   * @param {string} outputPath - Where to save file
   */
  async downloadResultToFile(pdfId, format, outputPath) {
    const content = await this.downloadResult(pdfId, format);
    fs.writeFileSync(outputPath, content);
    return outputPath;
  }

  /**
   * Download as text (Markdown)
   * @param {string} pdfId - PDF ID
   * @returns {Promise<string>} Markdown text
   */
  async downloadAsMarkdown(pdfId) {
    const buffer = await this.downloadResult(pdfId, 'mmd');
    return buffer.toString('utf-8');
  }

  /**
   * Download as lines JSON (OCR data with coordinates)
   * @param {string} pdfId - PDF ID
   * @returns {Promise<object>} Lines JSON data
   */
  async downloadAsLinesJson(pdfId) {
    const buffer = await this.downloadResult(pdfId, 'lines_json');
    return JSON.parse(buffer.toString('utf-8'));
  }

  /**
   * Delete PDF processing results
   * @param {string} pdfId - PDF ID
   */
  async deletePdf(pdfId) {
    try {
      const response = await fetch(`${this.baseUrl}/pdf/${pdfId}`, {
        method: 'DELETE',
        headers: {
          'app_id': this.appId,
          'app_key': this.appKey
        }
      });

      if (!response.ok && response.status !== 204) {
        throw new Error(`Mathpix API error: ${response.status}`);
      }

      return true;
    } catch (error) {
      throw new Error(`Failed to delete PDF: ${error.message}`);
    }
  }

  /**
   * Process PDF end-to-end: submit, wait, download
   * @param {Buffer|string} pdfInput - File buffer or file path
   * @param {object} options - Processing options
   * @returns {Promise<object>} {pdfId, markdown, linesJson, metadata}
   */
  async processPdfComplete(pdfInput, options = {}) {
    try {
      // Submit PDF
      let pdfId;
      if (typeof pdfInput === 'string') {
        // File path
        pdfId = await this.submitPdfByPath(pdfInput, options);
      } else {
        // Buffer
        pdfId = await this.submitPdfByBuffer(pdfInput, options.filename || 'document.pdf', options);
      }

      console.log(`[Mathpix] Submitted PDF, ID: ${pdfId}`);

      // Wait for completion
      const finalStatus = await this.waitUntilComplete(pdfId);
      console.log(`[Mathpix] PDF processing completed: ${finalStatus.percent_done}% done`);

      // Download results
      const markdown = await this.downloadAsMarkdown(pdfId);
      const linesJson = await this.downloadAsLinesJson(pdfId);

      return {
        pdfId,
        markdown,
        linesJson,
        metadata: {
          numPages: finalStatus.num_pages,
          status: finalStatus.status,
          processingTime: new Date().toISOString()
        }
      };
    } catch (error) {
      throw new Error(`PDF processing failed: ${error.message}`);
    }
  }

  /**
   * Helper: Build conversion formats object
   * @private
   */
  _buildConversionFormats(formats) {
    if (!formats || Object.keys(formats).length === 0) {
      return {};
    }

    const conversionFormats = {};
    if (formats.docx) conversionFormats.docx = true;
    if (formats.latex || formats.tex) conversionFormats['tex.zip'] = true;
    if (formats.html) conversionFormats.html = true;
    if (formats.pdf) conversionFormats.pdf = true;
    if (formats.pptx) conversionFormats.pptx = true;

    return conversionFormats.length > 0 ? { conversion_formats: conversionFormats } : {};
  }
}

module.exports = MathpixPdfService;
