let sharp;
try {
  sharp = require('sharp');
} catch (err) {
  console.warn('[ImagePreprocessor] Optional dependency `sharp` not available. Preprocessing will be a no-op.');
}

/**
 * ImagePreprocessor
 * - Uses `sharp` (if available) to perform production-grade preprocessing steps prior to OCR
 * - If `sharp` is unavailable the preprocess is a safe no-op and returns original buffer with diagnostics
 */
class ImagePreprocessor {
  /**
   * Preprocess an image buffer for OCR.
   * Steps: auto-orient, resize (if huge), grayscale, normalize, sharpen,
   * trim whitespace, convert to jpeg with sane quality.
   * Also computes basic diagnostics (brightness/contrast) to detect low-light/blurry.
   * @param {Buffer} buffer
   */
  static async preprocessBuffer(buffer) {
    if (!buffer || buffer.length === 0) throw new Error('Empty image buffer');

    if (!sharp) {
      // No-op fallback: return original buffer and note that sharp wasn't available
      return {
        buffer,
        diagnostics: {
          originalSize: buffer.length,
          processedSize: buffer.length,
          note: 'sharp not available - preprocessing skipped'
        },
        qualityRating: 'unknown'
      };
    }

    try {
      let img = sharp(buffer, { limitInputPixels: 10000 * 10000 });

      // Auto-rotate according to EXIF and ensure a working pipeline
      img = img.rotate();

      // Resize large images but preserve resolution enough for OCR
      const metadata = await img.metadata();
      const maxDim = Math.max(metadata.width || 0, metadata.height || 0);
      if (maxDim > 2500) {
        const scale = 2500 / maxDim;
        img = img.resize(Math.round((metadata.width || 2500) * scale), Math.round((metadata.height || 2500) * scale));
      }

      // Convert to greyscale and normalize contrast
      img = img.grayscale().normalize().sharpen();

      // Trim transparent/white borders (helps remove scanning whitespace)
      try {
        img = img.trim();
      } catch (e) {
        // trim may throw on some images; ignore non-fatal
      }

      // Final format & compression tuned for Mathpix upload
      img = img.jpeg({ quality: 82, chromaSubsampling: '4:4:4' });

      const outBuffer = await img.toBuffer();

      // Basic stats for heuristic quality checks
      const stats = await sharp(outBuffer).stats();
      const channel = stats.channels && stats.channels[0];
      const mean = channel ? channel.mean : 128;
      const stdev = channel ? channel.stdev : 30;

      const diagnostics = {
        originalSize: buffer.length,
        processedSize: outBuffer.length,
        width: metadata.width || null,
        height: metadata.height || null,
        meanBrightness: Math.round(mean),
        contrastStdDev: Math.round(stdev),
      };

      // Heuristic checks
      const isLowLight = mean < 45;
      const isLowContrast = stdev < 18;
      // Basic blur heuristic: low contrast often indicates blur/soft focus
      const isBlurry = isLowContrast;

      let qualityRating = 'high';
      if (isBlurry || isLowLight) qualityRating = 'low';
      else if (stdev < 28) qualityRating = 'medium';

      return {
        buffer: outBuffer,
        diagnostics: { ...diagnostics, isLowLight, isLowContrast, isBlurry },
        qualityRating
      };
    } catch (err) {
      throw new Error(`ImagePreprocessor failed: ${err.message}`);
    }
  }
}

module.exports = { ImagePreprocessor };
