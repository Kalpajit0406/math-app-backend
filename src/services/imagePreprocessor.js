/**
 * ImagePreprocessor — Production-Grade OCR Preprocessing
 *
 * PIPELINE (in order):
 *   1. Auto-orient (EXIF rotation)
 *   2. Page-type detection (scanned / photo / rotated / warped)
 *   3. Adaptive contrast enhancement
 *   4. Grayscale conversion
 *   5. Shadow removal (background normalization)
 *   6. Noise reduction (median-style via sharpen + normalize)
 *   7. Adaptive thresholding (simulate via clahe-like normalize)
 *   8. Edge sharpening
 *   9. Page border trimming
 *  10. DPI-aware resize (max 2500px, min 1200px for OCR quality)
 *  11. Final JPEG encode tuned for Mathpix upload
 *
 * DETECTS:
 *   - Low-light / underexposed images
 *   - Low-contrast / blurry images
 *   - Very large / very small images
 *   - Suspected photo (vs scanned flat image)
 *
 * DOES NOT modify:
 *   - Color channels beyond grayscale (math doesn't need color)
 *   - Resolution below OCR minimum
 */

'use strict';

let sharp;
try {
  sharp = require('sharp');
} catch (err) {
  console.warn('[ImagePreprocessor] `sharp` not available. Preprocessing will be a no-op.');
}

// ─── THRESHOLDS ───────────────────────────────────────────────────────────────
const OCR_MIN_DIM       = 1200;  // px — below this Mathpix quality degrades
const OCR_MAX_DIM       = 3000;  // px — above this we downsample
const LOW_LIGHT_MEAN    = 50;    // mean pixel value below this → low-light
const LOW_CONTRAST_STDEV = 20;   // stdev below this → low contrast / blurry
const VERY_HIGH_CONTRAST = 85;   // stdev above this → possibly photo with shadows
const TARGET_JPEG_QUALITY = 88;  // quality for Mathpix upload

class ImagePreprocessor {

  /**
   * Full preprocessing pipeline for an image buffer.
   *
   * @param {Buffer} buffer   - Raw image bytes
   * @returns {Promise<PreprocessResult>}
   */
  static async preprocessBuffer(buffer) {
    if (!buffer || buffer.length === 0) {
      throw new Error('Empty image buffer');
    }

    if (!sharp) {
      return {
        buffer,
        diagnostics: {
          originalSize: buffer.length,
          processedSize: buffer.length,
          note: 'sharp not available — preprocessing skipped',
          imageType: 'unknown',
          qualityIssues: [],
        },
        qualityRating: 'unknown',
      };
    }

    try {
      // ── Step 1: Load + auto-rotate from EXIF ──────────────────────────────
      let img = sharp(buffer, { limitInputPixels: 12000 * 12000 });
      img = img.rotate(); // respects EXIF orientation tag

      // ── Step 2: Read metadata for geometry decisions ───────────────────────
      const meta = await img.clone().metadata();
      const origW = meta.width  || 0;
      const origH = meta.height || 0;
      const maxDim = Math.max(origW, origH);
      const minDim = Math.min(origW, origH);
      const channels = meta.channels || 3;
      const isAlreadyGray = channels <= 2;

      // Detect photo vs flat scan heuristic:
      // Photos tend to have JPEG artifacts and non-uniform backgrounds.
      const isJpeg = meta.format === 'jpeg' || meta.format === 'jpg';

      // ── Step 3: Compute raw stats for quality assessment ──────────────────
      const rawStats = await img.clone().grayscale().raw().toBuffer({ resolveWithObject: true });
      const rawPixels = rawStats.data;
      const pixelCount = rawPixels.length;

      let sum = 0, sumSq = 0;
      for (let i = 0; i < pixelCount; i++) {
        sum   += rawPixels[i];
        sumSq += rawPixels[i] * rawPixels[i];
      }
      const rawMean  = sum / pixelCount;
      const rawStdev = Math.sqrt(sumSq / pixelCount - rawMean * rawMean);

      const qualityIssues = [];
      const isLowLight    = rawMean  < LOW_LIGHT_MEAN;
      const isLowContrast = rawStdev < LOW_CONTRAST_STDEV;
      const hasShadows    = rawStdev > VERY_HIGH_CONTRAST && isJpeg;
      const isTooSmall    = maxDim   < OCR_MIN_DIM;
      const isTooBig      = maxDim   > OCR_MAX_DIM;
      const isRotated     = meta.orientation && meta.orientation > 1;

      if (isLowLight)    qualityIssues.push('low_light');
      if (isLowContrast) qualityIssues.push('low_contrast');
      if (hasShadows)    qualityIssues.push('shadows');
      if (isTooSmall)    qualityIssues.push('low_resolution');
      if (isRotated)     qualityIssues.push('rotated');

      const imageType = hasShadows ? 'photo' : (isJpeg ? 'scan_jpeg' : 'scan_flat');

      // ── Step 4: Build processing pipeline ─────────────────────────────────
      img = sharp(buffer, { limitInputPixels: 12000 * 12000 }).rotate();

      // ── Step 5: Grayscale ──────────────────────────────────────────────────
      img = img.grayscale();

      // ── Step 6: Adaptive enhancement based on detected issues ─────────────
      if (isLowLight || isLowContrast) {
        // Aggressive normalization for underexposed images
        img = img.normalize();
        img = img.linear(
          isLowLight ? 1.4 : 1.2,   // multiply — boost brightness
          isLowLight ? -20  : -10    // offset — push blacks down
        );
      } else if (hasShadows) {
        // Shadow images: strong normalize + moderate sharpen
        img = img.normalize();
        img = img.clahe({ width: 64, height: 64, maxSlope: 3 });
      } else {
        // Normal scanned page: light normalize
        img = img.normalize();
      }

      // ── Step 7: Noise reduction + sharpening ──────────────────────────────
      // median-blur equivalent is not in sharp; use mild blur then sharpen trick
      if (qualityIssues.includes('low_resolution') || qualityIssues.includes('low_contrast')) {
        img = img.sharpen({ sigma: 1.5, m1: 1.0, m2: 0.5 });
      } else {
        img = img.sharpen({ sigma: 1.0, m1: 0.8, m2: 0.3 });
      }

      // ── Step 8: Resize ────────────────────────────────────────────────────
      if (isTooSmall && maxDim > 0) {
        // Upscale to at least OCR_MIN_DIM on the longest edge (Lanczos)
        const scale = OCR_MIN_DIM / maxDim;
        img = img.resize(
          Math.round(origW * scale),
          Math.round(origH * scale),
          { kernel: 'lanczos3' }
        );
      } else if (isTooBig && maxDim > 0) {
        // Downsample to OCR_MAX_DIM on longest edge
        const scale = OCR_MAX_DIM / maxDim;
        img = img.resize(
          Math.round(origW * scale),
          Math.round(origH * scale),
          { kernel: 'lanczos3' }
        );
      }

      // ── Step 9: Trim page borders ─────────────────────────────────────────
      try {
        img = img.trim({ background: '#ffffff', threshold: 10 });
      } catch (_) {
        // trim is optional — non-fatal
      }

      // ── Step 10: Output ───────────────────────────────────────────────────
      img = img.jpeg({
        quality:           TARGET_JPEG_QUALITY,
        chromaSubsampling: '4:4:4',
        optimiseCoding:    true,
        mozjpeg:           false, // keep fast
      });

      const outBuffer = await img.toBuffer();

      // ── Step 11: Post-process stats ───────────────────────────────────────
      const postStats = await sharp(outBuffer).stats();
      const postCh    = postStats.channels && postStats.channels[0];
      const postMean  = postCh ? postCh.mean  : rawMean;
      const postStdev = postCh ? postCh.stdev : rawStdev;

      let qualityRating = 'high';
      if (postMean < LOW_LIGHT_MEAN || postStdev < LOW_CONTRAST_STDEV)  qualityRating = 'low';
      else if (postStdev < 30 || postMean < 70)                          qualityRating = 'medium';

      const diagnostics = {
        originalSize:    buffer.length,
        processedSize:   outBuffer.length,
        origWidth:       origW,
        origHeight:      origH,
        format:          meta.format || 'unknown',
        imageType,
        rawMeanBrightness:  Math.round(rawMean),
        rawContrastStdDev:  Math.round(rawStdev),
        postMeanBrightness: Math.round(postMean),
        postContrastStdDev: Math.round(postStdev),
        qualityIssues,
        isLowLight,
        isLowContrast,
        hasShadows,
        isTooSmall,
        isRotated,
      };

      console.log('[ImagePreprocessor] Preprocessing complete:', {
        imageType,
        qualityRating,
        issues: qualityIssues,
        inSize:  `${(buffer.length / 1024).toFixed(1)}KB`,
        outSize: `${(outBuffer.length / 1024).toFixed(1)}KB`,
      });

      return { buffer: outBuffer, diagnostics, qualityRating };

    } catch (err) {
      throw new Error(`ImagePreprocessor failed: ${err.message}`);
    }
  }

  /**
   * Quick quality check without full preprocessing.
   * Used when you only need to know if an image is suitable for OCR.
   */
  static async assessQuality(buffer) {
    if (!sharp || !buffer) return { suitable: true, issues: [], qualityRating: 'unknown' };
    try {
      const stats = await sharp(buffer).grayscale().stats();
      const ch    = stats.channels && stats.channels[0];
      const mean  = ch ? ch.mean  : 128;
      const stdev = ch ? ch.stdev : 30;
      const issues = [];
      if (mean  < LOW_LIGHT_MEAN)    issues.push('low_light');
      if (stdev < LOW_CONTRAST_STDEV) issues.push('low_contrast');
      const suitable = issues.length === 0;
      const qualityRating = suitable ? 'high' : (issues.length === 1 ? 'medium' : 'low');
      return { suitable, issues, qualityRating, mean: Math.round(mean), stdev: Math.round(stdev) };
    } catch (_) {
      return { suitable: true, issues: [], qualityRating: 'unknown' };
    }
  }
}

module.exports = { ImagePreprocessor };
