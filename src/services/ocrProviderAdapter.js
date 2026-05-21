const { MathpixService } = require('./mathpixService');

/**
 * OCRProviderAdapter Service
 * Abstracts the OCR provider details, allowing alternative OCR providers
 * or mocking in tests.
 */
class OCRProviderAdapter {
  /**
   * Processes an image buffer through the OCR provider (Mathpix by default).
   * @param {Buffer} buffer
   * @param {string} mimetype
   * @param {string} filename
   */
  static async processImage(buffer, mimetype, filename) {
    // Delegates to the established MathpixService
    return await MathpixService.processBuffer(buffer, mimetype, filename);
  }
}

module.exports = { OCRProviderAdapter };
