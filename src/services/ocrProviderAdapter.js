'use strict';

const { MathpixService } = require('./mathpixService');

/**
 * OCRProviderAdapter — Standardized Document-OCR Interface
 *
 * Implements a standard adapter contract, handles multiple import styles,
 * logs diagnostics under non-production environments, and exposes standard methods.
 */
class OCRProviderAdapter {
  static get providerName() {
    return 'MathpixProvider';
  }

  /**
   * Standardized OCR execution endpoint (Static)
   */
  static async processImage(buffer, mimetype, filename, options = {}) {
    // 7. Diagnostics logging in non-production/debug mode
    if (process.env.DEBUG || process.env.NODE_ENV !== 'production') {
      console.log(`[OCR Diagnostics] Executing OCR via Provider: ${this.providerName}`);
      console.log(`[OCR Diagnostics] Available Methods:`, Object.getOwnPropertyNames(this).filter(p => typeof this[p] === 'function'));
    }

    // Delegate to established MathpixService
    return await MathpixService.processBuffer(buffer, mimetype, filename, options);
  }

  /**
   * 5. Backward Compatibility method wrapper
   */
  static async process(buffer, mimetype, filename, options = {}) {
    return this.processImage(buffer, mimetype, filename, options);
  }
}

// Support instance invocation if instantiated
OCRProviderAdapter.prototype.processImage = async function(buffer, mimetype, filename, options = {}) {
  return OCRProviderAdapter.processImage(buffer, mimetype, filename, options);
};

OCRProviderAdapter.prototype.process = async function(buffer, mimetype, filename, options = {}) {
  return OCRProviderAdapter.process(buffer, mimetype, filename, options);
};

// Create the export wrapper
const exportsObj = { OCRProviderAdapter };

// Expose functions directly on the exported object itself to resolve import mismatches!
exportsObj.processImage = async function(buffer, mimetype, filename, options = {}) {
  return OCRProviderAdapter.processImage(buffer, mimetype, filename, options);
};

exportsObj.process = async function(buffer, mimetype, filename, options = {}) {
  return OCRProviderAdapter.process(buffer, mimetype, filename, options);
};

module.exports = exportsObj;
