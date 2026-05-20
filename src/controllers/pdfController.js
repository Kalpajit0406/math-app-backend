const MathpixPdfService = require('../services/mathpixPdfService');
const { MCQDetector, LatexSanitizer, QuestionQueueManager } = require('../services/ocrPipeline');
const multer = require('multer');

/**
 * PDF Document Processing Controller
 * Handles PDF, DOCX, PPTX, and other document scanning
 * Integrates with multi-question detection and extraction
 */
class PdfController {
  constructor() {
    this.pdfService = new MathpixPdfService();
    this.queueManager = new QuestionQueueManager();
    this.storage = multer.memoryStorage();
    this.upload = multer({ storage: this.storage }).single('file');
  }

  /**
   * Submit PDF for processing
   * POST /api/v1/pdf/scan
   * Accepts: PDF, DOCX, PPTX, EPUB
   * 
   * Request body (multipart):
   *   - file: PDF file
   *   - options: {
   *       conversionFormats: {docx: true, latex: true},
   *       pageRanges: "1-5" (optional),
   *       streaming: false (default),
   *       extractQuestions: true (default)
   *     }
   * 
   * Response: {
   *   success: true,
   *   data: {
   *     pdfId: "2024_01_15_abc123",
   *     status: "submitted",
   *     statusUrl: "/api/v1/pdf/status/{pdfId}",
   *     message: "PDF submitted for processing. Poll status for updates."
   *   }
   * }
   */
  async submitPdf(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file provided'
        });
      }

      const options = req.body.options ? JSON.parse(req.body.options) : {};

      const pdfId = await this.pdfService.submitPdfByBuffer(
        req.file.buffer,
        req.file.originalname,
        {
          conversionFormats: options.conversionFormats || { docx: true, latex: true },
          pageRanges: options.pageRanges,
          streaming: options.streaming || false
        }
      );

      return res.json({
        success: true,
        data: {
          pdfId,
          status: 'submitted',
          statusUrl: `/api/v1/pdf/status/${pdfId}`,
          message: 'PDF submitted for processing. Poll status for updates.'
        }
      });
    } catch (error) {
      console.error('PDF submission error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Submit PDF by URL
   * POST /api/v1/pdf/scan-url
   * 
   * Request body: {
   *   url: "https://example.com/document.pdf",
   *   options: {
   *     conversionFormats: {docx: true},
   *     pageRanges: "1-10"
   *   }
   * }
   */
  async submitPdfByUrl(req, res) {
    try {
      const { url, options = {} } = req.body;

      if (!url) {
        return res.status(400).json({
          success: false,
          error: 'URL is required'
        });
      }

      const pdfId = await this.pdfService.submitPdfByUrl(url, {
        conversionFormats: options.conversionFormats || { docx: true, latex: true },
        pageRanges: options.pageRanges,
        streaming: options.streaming || false
      });

      return res.json({
        success: true,
        data: {
          pdfId,
          status: 'submitted',
          statusUrl: `/api/v1/pdf/status/${pdfId}`
        }
      });
    } catch (error) {
      console.error('PDF URL submission error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Check PDF processing status
   * GET /api/v1/pdf/status/:pdfId
   * 
   * Response: {
   *   success: true,
   *   data: {
   *     status: "processing|completed|failed",
   *     numPages: 12,
   *     numPagesCompleted: 8,
   *     percentDone: 66.67,
   *     conversionStatus: {
   *       docx: {status: "processing"},
   *       tex: {status: "completed"}
   *     },
   *     estimatedTimeRemaining: 45000 (ms)
   *   }
   * }
   */
  async getPdfStatus(req, res) {
    try {
      const { pdfId } = req.params;
      const status = await this.pdfService.getPdfStatus(pdfId);
      const conversionStatus = await this.pdfService.getConversionStatus(pdfId);

      const estimatedTimeRemaining = status.percent_done < 100
        ? Math.floor((100 - status.percent_done) * 1000)
        : 0;

      return res.json({
        success: true,
        data: {
          status: status.status,
          numPages: status.num_pages,
          numPagesCompleted: status.num_pages_completed,
          percentDone: status.percent_done,
          conversionStatus,
          estimatedTimeRemaining
        }
      });
    } catch (error) {
      console.error('PDF status error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Download PDF result in specific format
   * GET /api/v1/pdf/download/:pdfId/:format
   * 
   * Formats: mmd, docx, html, latex (returns tex.zip), lines_json
   * 
   * Returns: File binary or JSON
   */
  async downloadPdfResult(req, res) {
    try {
      const { pdfId, format } = req.params;

      if (!['mmd', 'markdown', 'docx', 'html', 'latex', 'tex', 'lines', 'lines_json'].includes(format)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid format. Supported: mmd, docx, html, latex, lines_json'
        });
      }

      const content = await this.pdfService.downloadResult(pdfId, format);

      // Set appropriate content type
      const contentTypes = {
        'mmd': 'text/markdown',
        'markdown': 'text/markdown',
        'html': 'text/html',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'latex': 'application/zip',
        'tex': 'application/zip',
        'lines_json': 'application/json',
        'json': 'application/json'
      };

      res.setHeader('Content-Type', contentTypes[format] || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="document.${format}"`);

      return res.send(content);
    } catch (error) {
      console.error('PDF download error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Extract questions from PDF with multi-question detection
   * POST /api/v1/pdf/extract-questions
   * 
   * Workflow:
   * 1. Submit PDF for processing
   * 2. Wait for Markdown output
   * 3. Parse Markdown for question boundaries
   * 4. Detect MCQ options per question
   * 5. Return queue of questions
   * 
   * Request: {
   *   url: "https://example.com/document.pdf" (if not uploading file)
   * }
   * 
   * Response: {
   *   success: true,
   *   data: {
   *     pdfId: "2024_01_15_abc123",
   *     totalQuestions: 5,
   *     questions: [
   *       {
   *         questionText: "What is...",
   *         options: [...],
   *         format: "mcq",
   *         questionNumber: "1",
   *         detectionOrder: 0,
   *         confidence: 0.92
   *       },
   *       ...
   *     ],
   *     rawMarkdown: "Full Markdown text",
   *     queueSessionId: "session_abc123"
   *   }
   * }
   */
  async extractQuestionsFromPdf(req, res) {
    try {
      let pdfId;
      let pdfContent = {};

      // Either use file upload or URL
      if (req.file) {
        pdfId = await this.pdfService.submitPdfByBuffer(
          req.file.buffer,
          req.file.originalname
        );
      } else if (req.body.url) {
        pdfId = await this.pdfService.submitPdfByUrl(req.body.url);
      } else if (req.body.pdfId) {
        // Use existing PDF ID
        pdfId = req.body.pdfId;
      } else {
        return res.status(400).json({
          success: false,
          error: 'Must provide file, URL, or existing pdfId'
        });
      }

      // Wait for completion if newly submitted
      if (!req.body.pdfId) {
        const status = await this.pdfService.waitUntilComplete(pdfId, 120000);
        if (status.status !== 'completed') {
          return res.status(500).json({
            success: false,
            error: 'PDF processing did not complete',
            status: status.status
          });
        }
      }

      // Download Markdown
      const markdown = await this.pdfService.downloadAsMarkdown(pdfId);
      pdfContent.markdown = markdown;

      // Parse questions using same MCQ detection as images
      const parsedQuestions = MCQDetector.detectMultiple(markdown, markdown);

      if (!parsedQuestions || parsedQuestions.length === 0) {
        return res.json({
          success: true,
          data: {
            pdfId,
            totalQuestions: 0,
            questions: [],
            rawMarkdown: markdown,
            warning: 'No questions detected in PDF'
          }
        });
      }

      // Create queue session
      const sessionId = `pdf_${pdfId}_${Date.now()}`;
      this.queueManager.storeQuestions(sessionId, parsedQuestions, 3600);

      return res.json({
        success: true,
        data: {
          pdfId,
          totalQuestions: parsedQuestions.length,
          questions: parsedQuestions,
          rawMarkdown: markdown,
          queueSessionId: sessionId,
          message: `Extracted ${parsedQuestions.length} questions from PDF`
        }
      });
    } catch (error) {
      console.error('Question extraction error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Stream PDF pages in real-time
   * GET /api/v1/pdf/stream/:pdfId
   * 
   * Server-Sent Events (SSE) connection
   * Streams pages as they complete
   * 
   * Client usage:
   * const eventSource = new EventSource('/api/v1/pdf/stream/pdf_id');
   * eventSource.onmessage = (e) => {
   *   const page = JSON.parse(e.data);
   *   console.log(`Received page ${page.page_number}`);
   * };
   */
  async streamPdfPages(req, res) {
    try {
      const { pdfId } = req.params;

      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Must resubmit with streaming enabled
      const streamingPdfId = await this.pdfService.submitPdfByUrl(
        `https://api.mathpix.com/v3/pdf/${pdfId}`, // Use existing
        { streaming: true }
      );

      // Stream pages
      await this.pdfService.streamPdfPages(
        streamingPdfId,
        (pageData, pageNum) => {
          res.write(`data: ${JSON.stringify({
            page_number: pageNum,
            ...pageData
          })}\n\n`);
        },
        (error) => {
          console.error('Streaming error:', error);
          res.write(`event: error\ndata: ${error.message}\n\n`);
          res.end();
        }
      );
    } catch (error) {
      console.error('Stream error:', error);
      res.status(500).end();
    }
  }

  /**
   * Delete PDF processing results
   * DELETE /api/v1/pdf/:pdfId
   */
  async deletePdf(req, res) {
    try {
      const { pdfId } = req.params;
      await this.pdfService.deletePdf(pdfId);

      return res.json({
        success: true,
        message: 'PDF deleted successfully'
      });
    } catch (error) {
      console.error('PDF deletion error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get multer middleware for file upload
   */
  getUploadMiddleware() {
    return this.upload;
  }
}

module.exports = PdfController;
