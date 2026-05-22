/**
 * OCRRecoveryEngine Service
 * Implements fallback and recovery strategies when the main OCR pipeline fails or returns extremely low confidence.
 */
class OCRRecoveryEngine {
  /**
   * Generates a descriptive placeholder question structure from raw input or error logs, preventing pipeline crashes.
   * @param {Error|string} errorOrRawText - The error object or the raw text block, if any
   * @param {string} filename - The uploaded filename
   * @returns {object} Standardized question object
   */
  static generateFallbackQuestion(errorOrRawText, filename = 'scanned_image.jpg') {
    console.warn('[OCRRecoveryEngine] Executing fallback recovery strategy.');

    let rawDetails = '';
    if (errorOrRawText instanceof Error) {
      rawDetails = `Error: ${errorOrRawText.message}`;
    } else if (typeof errorOrRawText === 'string') {
      rawDetails = errorOrRawText;
    }

    // Return a standardized question structure with the raw text mapped into it
    return {
      question: rawDetails ? `[Review Required] Scanned question from ${filename}:\n\n${rawDetails}` : `[Manual Entry Required] Failed to process image ${filename}. Please enter the question manually.`,
      options: [
        { label: 'A', text: '' },
        { label: 'B', text: '' },
        { label: 'C', text: '' },
        { label: 'D', text: '' }
      ],
      format: 'descriptive',
      questionNumber: '1',
      rawChunk: rawDetails || '',
      ocrConfidence: 0.0,
      detectionOrder: 1,
      verified: false,
      rawOcrData: {
        sourceUsed: 'recovery_engine',
        rawText: rawDetails,
        confidence: 0.0,
        recoveredAt: new Date()
      }
    };
  }

  /**
   * Checks if OCR results require recovery intervention (e.g. extremely low confidence or empty text).
   * @param {object} ocrResult - Result from MathpixService
   * @returns {boolean}
   */
  static needsRecovery(ocrResult) {
    if (!ocrResult) return true;
    
    const hasText = !!(ocrResult.rawText && ocrResult.rawText.trim());
    const hasLatex = !!(ocrResult.latex && ocrResult.latex.trim());
    
    // If no content is found, recovery is needed
    if (!hasText && !hasLatex) return true;

    // If confidence is extremely low (less than 15%), we flag it
    if (ocrResult.confidence !== null && ocrResult.confidence < 0.15) {
      return true;
    }

    return false;
  }
}

module.exports = { OCRRecoveryEngine };
