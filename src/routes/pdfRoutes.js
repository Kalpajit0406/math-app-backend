const express = require('express');
const router = express.Router();
const PdfController = require('../controllers/pdfController');
const authMiddleware = require('../middleware/authMiddleware');

const pdfController = new PdfController();

/**
 * PDF Processing Routes
 * Base path: /api/v1/pdf
 */

// Middleware for PDF file uploads (multipart/form-data)
const uploadMiddleware = pdfController.getUploadMiddleware();

/**
 * POST /api/v1/pdf/scan
 * Submit PDF file for processing
 * 
 * Form Data:
 *   - file: PDF file (required)
 *   - options: JSON string with {conversionFormats, pageRanges, streaming}
 * 
 * Example curl:
 * curl -X POST http://localhost:5000/api/v1/pdf/scan \
 *   -H "Authorization: Bearer token" \
 *   -F "file=@document.pdf" \
 *   -F 'options={"conversionFormats":{"docx":true}}'
 */
router.post(
  '/scan',
  authMiddleware,
  uploadMiddleware,
  (req, res) => pdfController.submitPdf(req, res)
);

/**
 * POST /api/v1/pdf/scan-url
 * Submit PDF by URL for processing
 * 
 * JSON Body:
 * {
 *   "url": "https://example.com/document.pdf",
 *   "options": {
 *     "conversionFormats": {"docx": true, "latex": true},
 *     "pageRanges": "1-10",
 *     "streaming": false
 *   }
 * }
 */
router.post(
  '/scan-url',
  authMiddleware,
  (req, res) => pdfController.submitPdfByUrl(req, res)
);

/**
 * GET /api/v1/pdf/status/:pdfId
 * Check PDF processing status
 * 
 * Response: {
 *   status: "processing|completed",
 *   numPages: 12,
 *   numPagesCompleted: 8,
 *   percentDone: 66.67,
 *   conversionStatus: {...}
 * }
 */
router.get(
  '/status/:pdfId',
  authMiddleware,
  (req, res) => pdfController.getPdfStatus(req, res)
);

/**
 * GET /api/v1/pdf/download/:pdfId/:format
 * Download PDF result in specific format
 * 
 * Formats: mmd, docx, html, latex (tex.zip), lines_json
 * 
 * Example:
 * GET /api/v1/pdf/download/2024_01_15_abc123/docx
 * GET /api/v1/pdf/download/2024_01_15_abc123/mmd
 * GET /api/v1/pdf/download/2024_01_15_abc123/lines_json
 */
router.get(
  '/download/:pdfId/:format',
  authMiddleware,
  (req, res) => pdfController.downloadPdfResult(req, res)
);

/**
 * POST /api/v1/pdf/extract-questions
 * Extract questions from PDF using multi-question detection
 * 
 * Three options:
 * 1. Upload PDF file
 * 2. Provide URL
 * 3. Use existing pdfId (must be completed)
 * 
 * JSON Body (option 2):
 * {
 *   "url": "https://example.com/textbook.pdf"
 * }
 * 
 * JSON Body (option 3):
 * {
 *   "pdfId": "2024_01_15_abc123"
 * }
 * 
 * Response: {
 *   success: true,
 *   data: {
 *     pdfId: "2024_01_15_abc123",
 *     totalQuestions: 5,
 *     questions: [
 *       {
 *         questionText: "Question content...",
 *         options: [{label: "A", text: "..."}, ...],
 *         format: "mcq",
 *         questionNumber: "1",
 *         detectionOrder: 0,
 *         confidence: 0.92
 *       }
 *     ],
 *     queueSessionId: "pdf_2024_01_15_abc123_1234567890"
 *   }
 * }
 */
router.post(
  '/extract-questions',
  authMiddleware,
  uploadMiddleware,
  (req, res) => pdfController.extractQuestionsFromPdf(req, res)
);

/**
 * GET /api/v1/pdf/stream/:pdfId
 * Stream PDF pages in real-time (Server-Sent Events)
 * 
 * Note: Client must submit PDF with streaming enabled first
 * 
 * Example client code:
 * const eventSource = new EventSource('/api/v1/pdf/stream/pdf_id');
 * eventSource.onmessage = (event) => {
 *   const page = JSON.parse(event.data);
 *   console.log(`Received page ${page.page_number}`);
 * };
 * eventSource.onerror = () => eventSource.close();
 */
router.get(
  '/stream/:pdfId',
  authMiddleware,
  (req, res) => pdfController.streamPdfPages(req, res)
);

/**
 * DELETE /api/v1/pdf/:pdfId
 * Delete PDF processing results from Mathpix
 * 
 * WARNING: Deletion is permanent. Download files before deleting.
 */
router.delete(
  '/:pdfId',
  authMiddleware,
  (req, res) => pdfController.deletePdf(req, res)
);

module.exports = router;
