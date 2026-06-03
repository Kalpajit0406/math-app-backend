const MathpixPdfService = require('../services/mathpixPdfService');
const { MCQDetector, LatexSanitizer } = require('../services/ocrPipeline');
const { VerificationQueueManager } = require('../services/verificationQueueManager');
const multer = require('multer');
const { exec } = require('child_process');
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
 * PDF Document Processing Controller
 * Handles PDF, DOCX, PPTX, and other document scanning
 * Integrates with multi-question detection and extraction
 */
class PdfController {
  constructor() {
    this.pdfService = new MathpixPdfService();
    // Use disk storage to prevent loading entire large PDFs into Node memory
    const path = require('path');
    const tempDir = path.join(__dirname, '../../public/temp');
    
    // Ensure directory exists
    const fs = require('fs');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const diskStorage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, tempDir);
      },
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
      limits: {
        fileSize: 100 * 1024 * 1024, // Max size 100MB
        files: 1
      }
    }).single('file');
  }

  /**
   * Submit PDF for processing
   * POST /api/v1/pdf/scan
   */
  async submitPdf(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file provided'
        });
      }

      const pdfPath = req.file.path;
      const filename = req.file.originalname;

      // Extract page count
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

      // Enqueue to Redis for async page processing
      const DistributedQueue = require('../utils/redisQueue');
      const preprocessingQueue = new DistributedQueue('preprocessing');

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const childJob = new OCRJob({
          status: 'pending',
          sourceType: 'pdf_page',
          filename: `${parentJob._id}_page_${pageNum}.jpg`,
          mimetype: 'image/jpeg',
          availableAt: new Date()
        });
        await childJob.save();

        await preprocessingQueue.addJob(childJob._id.toString(), {
          jobId: childJob._id.toString(),
          parentJobId: parentJob._id.toString(),
          pdfPath,
          pageNum,
          totalPages
        });
      }

      return res.status(202).json({
        success: true,
        data: {
          pdfId: parentJob._id,
          status: 'submitted',
          statusUrl: `/api/v1/pdf/status/${parentJob._id}`,
          message: `PDF submitted for processing. Processing ${totalPages} pages asynchronously.`
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
   */
  async submitPdfByUrl(req, res) {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({
          success: false,
          error: 'URL is required'
        });
      }

      const path = require('path');
      const fs = require('fs');
      const tempPath = path.join(__dirname, `../../public/temp/pdf-${Date.now()}-${Math.random().toString(36).substring(7)}.pdf`);

      // Stream download to disk
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download PDF from URL: ${response.statusText}`);
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

      const DistributedQueue = require('../utils/redisQueue');
      const preprocessingQueue = new DistributedQueue('preprocessing');

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const childJob = new OCRJob({
          status: 'pending',
          sourceType: 'pdf_page',
          filename: `${parentJob._id}_page_${pageNum}.jpg`,
          mimetype: 'image/jpeg',
          availableAt: new Date()
        });
        await childJob.save();

        await preprocessingQueue.addJob(childJob._id.toString(), {
          jobId: childJob._id.toString(),
          parentJobId: parentJob._id.toString(),
          pdfPath: tempPath,
          pageNum,
          totalPages
        });
      }

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
      return res.status(500).json({
        success: false,
        error: error.message
      });
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

      const childJobs = await OCRJob.find({ filename: new RegExp(`^${pdfId}_page_`) });
      const numPages = childJobs.length;
      const completedPages = childJobs.filter(j => j.status === 'done').length;
      const percentDone = numPages > 0 ? (completedPages / numPages) * 100 : 0;

      return res.json({
        success: true,
        data: {
          status: percentDone === 100 ? 'completed' : parentJob.status,
          numPages,
          numPagesCompleted: completedPages,
          percentDone: parseFloat(percentDone.toFixed(2)),
          conversionStatus: {},
          estimatedTimeRemaining: percentDone < 100 ? Math.floor((numPages - completedPages) * 4000) : 0
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
   */
  async downloadPdfResult(req, res) {
    return res.status(501).json({ success: false, error: 'Markdown/DOCX downloads are handled inside individual Verification Sessions' });
  }

  /**
   * Extract questions from PDF with multi-question detection
   * POST /api/v1/pdf/extract-questions
   */
  async extractQuestionsFromPdf(req, res) {
    try {
      let pdfPath;
      let filename;

      if (req.file) {
        pdfPath = req.file.path;
        filename = req.file.originalname;
      } else if (req.body.url) {
        const path = require('path');
        const fs = require('fs');
        pdfPath = path.join(__dirname, `../../public/temp/pdf-${Date.now()}-${Math.random().toString(36).substring(7)}.pdf`);
        filename = req.body.url.split('/').pop() || 'document.pdf';

        const response = await fetch(req.body.url);
        if (!response.ok) {
          throw new Error(`Failed to download PDF from URL: ${response.statusText}`);
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

      const sessionId = `pdf_${parentJob._id}_${Date.now()}`;
      const userId = req.user?.id || req.user?._id;

      // Pre-create VerificationSession in MongoDB
      const session = await VerificationQueueManager.createSession(
        sessionId,
        userId,
        [], // No items yet
        86400,
        null,
        {
          pageType: 'UNKNOWN_PAGE',
          sectionsFound: 0,
          totalExtracted: 0,
          totalRejected: 0,
          sourceUsed: 'pdf',
          processingTimeMs: 0
        },
        'pending',
        0
      );

      const DistributedQueue = require('../utils/redisQueue');
      const preprocessingQueue = new DistributedQueue('preprocessing');

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const childJob = new OCRJob({
          status: 'pending',
          sourceType: 'pdf_page',
          filename: `${parentJob._id}_page_${pageNum}.jpg`,
          mimetype: 'image/jpeg',
          availableAt: new Date()
        });
        await childJob.save();

        await preprocessingQueue.addJob(childJob._id.toString(), {
          jobId: childJob._id.toString(),
          parentJobId: parentJob._id.toString(),
          sessionId: session.sessionId,
          pdfPath,
          pageNum,
          totalPages
        });
      }

      console.log(`[PdfController] extractQuestionsFromPdf: Enqueued parentJob=${parentJob._id}, sessionId=${session.sessionId}`);

      return res.status(202).json({
        success: true,
        data: {
          pdfId: parentJob._id,
          sessionId: session.sessionId,
          queueSessionId: session.sessionId,
          currentIndex: 0,
          total: 0,
          items: [],
          status: 'pending',
          progress: 0,
          expiresAt: session.expiresAt
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
