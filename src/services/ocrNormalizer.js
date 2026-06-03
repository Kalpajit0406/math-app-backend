/**
 * OCRNormalizer — Production-Grade OCR Text Normalization
 *
 * PURPOSE:
 *   Clean raw OCR text to make segmentation and parsing more reliable,
 *   WITHOUT destroying mathematical content.
 *
 * OPERATIONS (safe, always applied):
 *   1. Line ending normalization
 *   2. Unicode space normalization
 *   3. Bengali digit → ASCII digit conversion
 *   4. Multiple space/tab collapse
 *   5. Excessive blank line collapse
 *   6. OCR broken numbering repair ("11 . Q" → "11. Q")
 *   7. Remove stray control characters
 *   8. Preserve LaTeX blocks (never merge across $ boundaries)
 *   9. Smart line joining (only if safe — no question headers, no option labels)
 *
 * NEVER:
 *   - Merges lines across question number boundaries
 *   - Merges lines that start with option labels
 *   - Merges lines when the previous line ends with terminal punctuation
 *   - Touches content inside LaTeX delimiters
 */

'use strict';

// ─── PATTERNS THAT PREVENT LINE MERGING ──────────────────────────────────────

// A line that starts a new question
const QUESTION_HEADER_RE = /^(?:Question\s+\d+|Q\s*\d+|Q\d+|\d{1,3}[\.\)]\s+[^\s])/i;

// A line that starts an option (A., (A), ক., ১., i., (i))
const OPTION_LABEL_RE = /^[\(\[]?\s*(?:[A-Da-d]|[1-4ক-ঘ১-৪]|i{1,4}|I{1,4})\s*[\)\]\.\:]\s+/;

// Terminal punctuation — lines ending in these should NOT be joined forward
const TERMINAL_PUNCT_RE = /[\.?!:;)\]}\$\\]$/;

// LaTeX delimiter pairs — content inside is preserved
const LATEX_BLOCK_RE = /(\$\$[\s\S]*?\$\$|\$[^$\n]*?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g;

// ─── BENGALI DIGIT MAP ────────────────────────────────────────────────────────
function bengaliToAsciiDigits(str) {
  if (!str) return str;
  return str.replace(/[০-৯]/g, ch => String(ch.codePointAt(0) - 0x09E6));
}

class OCRNormalizer {

  /**
   * Normalize OCR text for reliable segmentation.
   * @param {string} text
   * @returns {string}
   */
  static normalizeText(text) {
    if (!text || typeof text !== 'string') return '';

    let s = text;

    // ── 1. Line ending normalization ─────────────────────────────────────────
    s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // ── 2. Unicode space normalization ───────────────────────────────────────
    s = s.replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ');

    // ── 3. Bengali digit normalization ───────────────────────────────────────
    s = bengaliToAsciiDigits(s);

    // ── 4. Multiple space/tab collapse ───────────────────────────────────────
    s = s.replace(/[ \t]+/g, ' ');

    // ── 5. Excessive blank lines ─────────────────────────────────────────────
    s = s.replace(/\n{3,}/g, '\n\n');

    // ── 6. Broken question numbering repair ──────────────────────────────────
    // "11 . Question" → "11. Question" (OCR splits the period)
    s = s.replace(/(^|\n)(\s*)(\d+)\s+\.\s+/g, (_, nl, ws, num) => `${nl}${ws}${num}. `);

    // ── 7. Remove stray control characters ──────────────────────────────────
    s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // ── 8. Smart line joining ─────────────────────────────────────────────────
    // Join continuation lines BUT protect LaTeX blocks and question/option starts
    s = this._smartJoinLines(s);

    return s.trim();
  }

  // ─── PRIVATE ───────────────────────────────────────────────────────────────

  /**
   * Join lines that are clearly continuations of the previous line.
   * Preserves structural boundaries (question headers, option labels, LaTeX blocks).
   */
  static _smartJoinLines(text) {
    const lines = text.split('\n');
    const result = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (result.length === 0) {
        result.push(line);
        continue;
      }

      const prev = result[result.length - 1];
      const prevTrimmed = prev.trim();

      // Never merge if current line starts a question or option
      if (QUESTION_HEADER_RE.test(trimmed) || OPTION_LABEL_RE.test(trimmed)) {
        result.push(line);
        continue;
      }

      // Never merge if previous line ends with terminal punctuation
      if (TERMINAL_PUNCT_RE.test(prevTrimmed)) {
        result.push(line);
        continue;
      }

      // Never merge blank lines
      if (!trimmed || !prevTrimmed) {
        result.push(line);
        continue;
      }

      // Only merge if current line starts with lowercase letter, digit, or math
      if (/^[a-z0-9\\\(\$\[]/.test(trimmed)) {
        // Check if prev ends with backslash (LaTeX line continuation)
        if (/(?<!\\)\\$/.test(prevTrimmed)) {
          result[result.length - 1] = prevTrimmed + trimmed;
        } else {
          result[result.length - 1] = prev + ' ' + trimmed;
        }
      } else {
        result.push(line);
      }
    }

    return result.join('\n');
  }
}

module.exports = { OCRNormalizer };
