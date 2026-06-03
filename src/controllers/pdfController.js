const MathpixPdfService = require('../services/mathpixPdfService');
const { MCQDetector, LatexSanitizer, OCRPipeline } = require('../services/ocrPipeline');
const { VerificationQueueManager } = require('../services/verificationQueueManager');
const multer = require('multer');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

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

/**
 * Extract a single PDF page as a JPEG buffer using pdftoppm.
 * Resolution 200 DPI — good quality/speed balance.
 */
function extractPageAsBuffer(pdfPath, pageNum) {
  return new Promise((resolve, reject) => {
    const tmpBase = path.join(
      path.dirname(pdfPath),
      `ocr-page-${Date.now()}-${pageNum}`
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

/**
 * PDF Document Processing Controller
 */
class PdfController {
  constructor() {
    this.pdfService = new MathpixPdfService();
    const tempDir = path.join(__dirname, '../../public/temp');

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const diskStorage = multer.diskStorage({
      destination: (req, file, cb) => cb(null, tempDir),
      filename: (req, file, cb) => {
        const cleanExt = path.extname(file.originalname).toLowerCase();
        const safeBase = path.basename(file.originalname, cleanExt)
          .replace(/[^a-zA-Z0-9]/g, '_')
          .substring(0, 50);
        cb(null, `pdf-${Date.now()}-${safeBase}${cleanExt}`);
      }
    });

    this.upload = multer({
      storage: diskStorage,
      limits: { fileSize: 100 * 1024 * 1024, files: 1 }
    }).single('file');
  }

  /**
   * Submit PDF for processing (async queue — kept for compatibility)
   * POST /api/v1/pdf/scan
   */
  async submitPdf(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file provided' });
      }

      const pdfPath = req.file.path;
      const filename = req.file.originalname;
      const totalPages = await getPdfPageCount(pdfPath);

      const OCRJob = require('../models/ocrJobModel');
      const parentJob = new OCRJob({
        status: 'pending',
        sourceType: 'pdf',
        filename,
        mimetype: 'application/pdf',
        error: null,
      });
      await parentJob.save();

      return res.status(202).json({
        success: true,
        data: {
          pdfId: parentJob._id,
          status: 'submitted',
          statusUrl: `/api/v1/pdf/status/${parentJob._id}`,
          message: `PDF submitted. ${totalPages} pages queued.`
        }
      });
    } catch (error) {
      console.error('PDF submission error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Submit PDF by URL
   * POST /api/v1/pdf/scan-url
   */
  async submitPdfByUrl(req, res) {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ success: false, error: 'URL is required' });
      }

      const tempPath = path.join(__dirname, `../../public/temp/pdf-${Date.now()}.pdf`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download PDF: ${response.statusText}`);
      }

      const fileStream = fs.createWriteStream(tempPath);
      await new Promise((resolve, reject) => {
        response.body.pipe(fileStream);
        response.body.on('error', reject);
        fileStream.on('finish', resolve);
      });

      const totalPages = await getPdfPageCount(tempPath);
      const OCRJob = require('../models/ocrJobModel');
      const parentJob = new OCRJob({
        status: 'pending',
        sourceType: 'pdf',
        filename: url.split('/').pop() || 'document.pdf',
        mimetype: 'application/pdf',
        error: null,
      });
      await parentJob.save();

      return res.status(202).json({
        success: true,
        data: {
          pdfId: parentJob._id,
          status: 'submitted',
          statusUrl: `/api/v1/pdf/status/${parentJob._id}`
        }
      });
    } catch (error) {
      console.error('PDF URL submission error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Check PDF processing status
   * GET /api/v1/pdf/status/:pdfId
   */
  async getPdfStatus(req, res) {
    try {
      const { pdfId } = req.params;
      const OCRJob = require('../models/ocrJobModel');
      const parentJob = await OCRJob.findById(pdfId);
      if (!parentJob) {
        return res.status(404).json({ success: false, error: 'PDF job not found' });
      }

      return res.json({
        success: true,
        data: {
          status: parentJob.status === 'done' ? 'completed' : parentJob.status,
          percentDone: parentJob.status === 'done' ? 100 : 0,
          estimatedTimeRemaining: 0
        }
      });
    } catch (error) {
      console.error('PDF status error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Download PDF result
   * GET /api/v1/pdf/download/:pdfId/:format
   */
  async downloadPdfResult(req, res) {
    return res.status(501).json({
      success: false,
      error: 'Downloads handled inside individual Verification Sessions'
    });
  }

  /**
   * ═══════════════════════════════════════════════════════════════
   * MAIN EXTRACTION ENDPOINT — Synchronous In-Process PDF OCR
   * ═══════════════════════════════════════════════════════════════
   * POST /api/v1/pdf/extract-questions
   *
   * Strategy:
   *  1. Accept uploaded PDF file (or URL)
   *  2. Count pages with pdfinfo
   *  3. For each page: render to JPEG with pdftoppm (200 DPI)
   *  4. Run OCRPipeline.runFromBuffer() directly — same path as image scan
   *  5. Collect all parsed questions
   *  6. Create VerificationSession with status='completed'
   *  7. Return 200 with full session data immediately
   *
   * No Redis, no distributed worker, no polling needed.
   * Response arrives as soon as all pages are processed.
   */
  async extractQuestionsFromPdf(req, res) {
    let pdfPath = null;
    let ownedPdf = false; // did we download it (needs cleanup)?

    try {
      // ── 1. Resolve PDF path ───────────────────────────────────────────
      if (req.file) {
        pdfPath = req.file.path;
        ownedPdf = false; // multer owns cleanup
      } else if (req.body && req.body.url) {
        pdfPath = path.join(__dirname, `../../public/temp/pdf-${Date.now()}.pdf`);
        ownedPdf = true;
        const response = await fetch(req.body.url);
        if (!response.ok) {
          throw new Error(`Failed to download PDF: ${response.statusText}`);
        }
        const fileStream = fs.createWriteStream(pdfPath);
        await new Promise((resolve, reject) => {
          response.body.pipe(fileStream);
          response.body.on('error', reject);
          fileStream.on('finish', resolve);
        });
      } else {
        return res.status(400).json({
          success: false,
          error: 'Must upload a PDF file or provide a URL'
        });
      }

      // ── 2. Page count ─────────────────────────────────────────────────
      let totalPages;
      try {
        totalPages = await getPdfPageCount(pdfPath);
      } catch (e) {
        throw new Error(`Cannot read PDF: ${e.message}. Make sure it is a valid PDF file.`);
      }

      console.log(`[PdfController] Starting synchronous extraction: ${totalPages} pages`);

      // ── 3. Process each page synchronously ────────────────────────────
      const allQuestions = [];
      let globalOrder = 0;

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        console.log(`[PdfController] Processing page ${pageNum}/${totalPages}`);
        try {
          const pageBuffer = await extractPageAsBuffer(pdfPath, pageNum);
          const result = await OCRPipeline.runFromBuffer(
            pageBuffer,
            'image/jpeg',
            `page_${pageNum}.jpg`
          );

          const pageQuestions = result.parsedQuestions || [];
          console.log(`[PdfController] Page ${pageNum}: extracted ${pageQuestions.length} questions`);

          // Prefix question numbers with page number for traceability
          pageQuestions.forEach(q => {
            globalOrder++;
            q.detectionOrder = globalOrder;
            q.questionNumber = pageQuestions.length > 1
              ? `${pageNum}-${q.questionNumber || globalOrder}`
              : q.questionNumber || String(globalOrder);
          });

          allQuestions.push(...pageQuestions);
        } catch (pageErr) {
          // Don't abort — log and continue with remaining pages
          console.error(`[PdfController] Page ${pageNum} failed (skipping):`, pageErr.message);
        }
      }

      console.log(`[PdfController] Total questions extracted: ${allQuestions.length}`);

      // ── 4. Create VerificationSession ─────────────────────────────────
      const sessionId = `pdf_sync_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const userId = req.user?.id || req.user?._id || null;

      const session = await VerificationQueueManager.createSession(
        sessionId,
        userId,
        allQuestions,
        86400, // 24h TTL
        null,
        {
          pageType: 'PDF_DOCUMENT',
          sectionsFound: 0,
          totalExtracted: allQuestions.length,
          totalRejected: 0,
          sourceUsed: 'pdf_sync',
          processingTimeMs: 0,
          totalPages
        },
        'completed',
        100
      );

      // ── 5. Cleanup PDF from disk ───────────────────────────────────────
      if (ownedPdf && pdfPath && fs.existsSync(pdfPath)) {
        try { fs.unlinkSync(pdfPath); } catch (_) {}
      }

      // ── 6. Return completed session immediately ────────────────────────
      return res.status(200).json({
        success: true,
        data: {
          pdfId: sessionId,
          sessionId: session.sessionId,
          queueSessionId: session.sessionId,
          currentIndex: 0,
          total: allQuestions.length,
          items: session.items || [],
          questions: session.items || [],
          status: 'completed',
          progress: 100,
          totalPages,
          expiresAt: session.expiresAt
        }
      });

    } catch (error) {
      // Cleanup on error
      if (ownedPdf && pdfPath && fs.existsSync(pdfPath)) {
        try { fs.unlinkSync(pdfPath); } catch (_) {}
      }
      console.error('[PdfController] extractQuestionsFromPdf error:', error);
      return res.status(500).json({
        success: false,
        error: `PDF extraction failed: ${error.message}`
      });
    }
  }

  /**
   * Stream PDF pages (legacy stub)
   * GET /api/v1/pdf/stream/:pdfId
   */
  async streamPdfPages(req, res) {
    return res.status(501).json({ success: false, error: 'Streaming not supported in sync mode' });
  }

  /**
   * Delete PDF
   * DELETE /api/v1/pdf/:pdfId
   */
  async deletePdf(req, res) {
    try {
      const { pdfId } = req.params;
      await this.pdfService.deletePdf(pdfId);
      return res.json({ success: true, message: 'PDF deleted successfully' });
    } catch (error) {
      console.error('PDF deletion error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  getUploadMiddleware() {
    return this.upload;
  }
}

module.exports = PdfController;
