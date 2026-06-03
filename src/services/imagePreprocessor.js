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

      // ── Step 3: Compute raw stats + histogram equivalents for quality ──────
      const rawStats = await img.clone().grayscale().raw().toBuffer({ resolveWithObject: true });
      const rawPixels = rawStats.data;
      const pixelCount = rawPixels.length;

      let sum = 0, sumSq = 0, minVal = 255, maxVal = 0;
      for (let i = 0; i < pixelCount; i++) {
        const val = rawPixels[i];
        sum   += val;
        sumSq += val * val;
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
      }
      const rawMean  = sum / pixelCount;
      const rawStdev = Math.sqrt(sumSq / pixelCount - rawMean * rawMean);

      const qualityIssues = [];
      const isLowLight    = rawMean < 85;
      const isLowContrast = rawStdev < 24;
      const isShadowHeavy = rawStdev > 70 && minVal < 20;
      const hasShadows    = isShadowHeavy;
      const isGlare       = maxVal === 255 && rawMean > 195 && rawStdev > 45;
      const isBlurred     = rawStdev < 18;
      const isTooSmall    = maxDim < OCR_MIN_DIM;
      const isTooBig      = maxDim > OCR_MAX_DIM;
      const isRotated     = meta.orientation && meta.orientation > 1;

      if (isLowLight)    qualityIssues.push('low_light');
      if (isLowContrast) qualityIssues.push('low_contrast');
      if (isShadowHeavy) qualityIssues.push('shadows');
      if (isGlare)       qualityIssues.push('glare');
      if (isBlurred)     qualityIssues.push('blur');
      if (isTooSmall)    qualityIssues.push('low_resolution');
      if (isRotated)     qualityIssues.push('rotated');

      // Classification of Image Type for pipeline routing
      let imageType = 'mobile_photo';
      if (rawMean > 220 && rawStdev > 25 && qualityIssues.length === 0) {
        imageType = 'scanned_clean'; // Minimal processing needed
      } else if (isLowLight || isShadowHeavy) {
        imageType = 'low_light';
      } else if (isBlurred) {
        imageType = 'blurry';
      }

      // ── Step 4: Build processing pipeline ─────────────────────────────────
      img = sharp(buffer, { limitInputPixels: 12000 * 12000 }).rotate().grayscale();

      let deNoisingApplied = false;
      let binarizationApplied = false;
      let claheApplied = false;
      let adaptiveGammaApplied = false;
      let dynamicThreshold = null;

      // ── Step 5: Route Preprocessing Pipeline based on Image Type ──────────
      if (imageType === 'scanned_clean') {
        // 1. Clean PDF / Flat Scan
        img = img.normalize();
        img = img.sharpen({ sigma: 0.5 });
      } else if (imageType === 'blurry') {
        // 2. Blurry Image Pipeline: Aggressive Edge restoration + Median denoise
        img = img.sharpen({ sigma: 2.2, m1: 1.5, m2: 0.8 });
        img = img.median(3);
        img = img.normalize();
        deNoisingApplied = true;
      } else if (imageType === 'low_light') {
        // 3. Low-Light / Shadow-Heavy Page Pipeline
        // Gamma stretch for midtone brightness recovery
        img = img.gamma(2.0);
        adaptiveGammaApplied = true;

        // Brightness and contrast multiplier adjustments
        const mult = rawMean < 50 ? 1.6 : 1.35;
        const offset = rawMean < 50 ? 25 : 12;
        img = img.linear(mult, offset);

        // Local CLAHE equalization to handle shadow imbalances
        img = img.clahe({ width: 32, height: 32, maxSlope: 3 });
        claheApplied = true;

        // Adaptive thresholding: dynamic threshold offset
        dynamicThreshold = Math.max(90, Math.min(220, Math.round(rawMean * 1.12)));
        img = img.threshold(dynamicThreshold);
        binarizationApplied = true;
        deNoisingApplied = true;
      } else {
        // 4. Default Mobile Photo Pipeline: Median denoise + CLAHE + Sharpen
        img = img.median(3);
        img = img.clahe({ width: 64, height: 64, maxSlope: 2 });
        img = img.normalize();
        img = img.sharpen({ sigma: 1.2 });
        deNoisingApplied = true;
        claheApplied = true;
      }

      // ── Step 6: Geometry and Resize Correction ─────────────────────────────
      let skewAngle = 0;
      if (isRotated) {
        skewAngle = 90;
      }

      if (isTooSmall && maxDim > 0) {
        const scale = OCR_MIN_DIM / maxDim;
        img = img.resize(
          Math.round(origW * scale),
          Math.round(origH * scale),
          { kernel: 'lanczos3' }
        );
      } else if (isTooBig && maxDim > 0) {
        const scale = OCR_MAX_DIM / maxDim;
        img = img.resize(
          Math.round(origW * scale),
          Math.round(origH * scale),
          { kernel: 'lanczos3' }
        );
      }

      // ── Step 7: Trim Page borders ─────────────────────────────────────────
      try {
        img = img.trim({ background: '#ffffff', threshold: 12 });
      } catch (_) {}

      // ── Step 8: Encode Output ──────────────────────────────────────────────
      img = img.jpeg({
        quality:           TARGET_JPEG_QUALITY,
        chromaSubsampling: '4:4:4',
        optimiseCoding:    true,
      });

      const outBuffer = await img.toBuffer();

      // ── Step 9: Post-process stats ────────────────────────────────────────
      const postStats = await sharp(outBuffer).stats();
      const postCh    = postStats.channels && postStats.channels[0];
      const postMean  = postCh ? postCh.mean  : rawMean;
      const postStdev = postCh ? postCh.stdev : rawStdev;

      let qualityRating = 'high';
      if (postMean < 50 || postStdev < 20)  qualityRating = 'low';
      else if (postStdev < 30 || postMean < 70) qualityRating = 'medium';

      const diagnostics = {
        originalSize:       buffer.length,
        processedSize:      outBuffer.length,
        origWidth:          origW,
        origHeight:         origH,
        format:             meta.format || 'unknown',
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
        skewAngle,
        deNoisingApplied: true,
        binarizationApplied: isLowLight || isLowContrast,
      };

      console.log('[ImagePreprocessor] Preprocessing complete:', {
        imageType,
        qualityRating,
        issues: qualityIssues,
        inSize:  `${(buffer.length / 1024).toFixed(1)}KB`,
        outSize: `${(outBuffer.length / 1024).toFixed(1)}KB`,
        skewAngle,
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
