/**
 * OCRNormalizer — Phase 3: Text Normalization
 *
 * APPLIES IN ORDER (all operations are safe — no content destruction):
 *
 *   1.  Line-ending normalization                 (\r\n → \n)
 *   2.  Invisible Unicode removal                 (zero-width, BOM, soft-hyphen …)
 *   3.  Fullwidth punctuation normalization       （） → ()   ．→ .   ？→ ?  ＜＞→ <>
 *   4.  Bengali punctuation normalization         ।→ .  (end-of-sentence danda)
 *   5.  Unicode space normalization               NBSP, thin-space, em-space → ASCII space
 *   6.  Bengali digit → ASCII digit              ০১২৩৪৫৬৭৮৯ → 0-9
 *   7.  Multiple space/tab collapse
 *   8.  Excessive blank-line collapse             (3+ → 2)
 *   9.  Broken OCR number repair                 "11 . Q" → "11. Q"
 *  10.  Stray control character removal           (0x00–0x1F except \n)
 *  11.  Unicode replacement char normalization    \uFFFD → ?
 *  12.  Mathematical operator normalization       − → -  × → \times  etc.
 *  13.  Smart line joining                        continuation lines joined safely
 *
 * NEVER:
 *   - Merges across question boundaries
 *   - Merges across option label lines
 *   - Touches content inside LaTeX delimiters
 *   - Removes Bengali or English text characters
 */

'use strict';

// ─── FULLWIDTH → ASCII PUNCTUATION MAP ───────────────────────────────────────
// Fullwidth and special Unicode punctuation → ASCII equivalents
const FULLWIDTH_MAP = {
  '（': '(', '）': ')',
  '〔': '(', '〕': ')',
  '【': '[', '】': ']',
  '｛': '{', '｝': '}',
  '＜': '<', '＞': '>',
  '、': ',', '，': ',', '，': ',',
  '。': '.', '．': '.', '·': '.',
  '；': ';', '：': ':',
  '？': '?', '！': '!',
  '\'': "'", '\u2019': "'", '\u2018': "'",
  '"': '"',  '\u201D': '"', '\u201C': '"',
  '\u2013': '-', '\u2014': '-',  // en-dash, em-dash → hyphen
  '\u2212': '-',                 // minus sign → hyphen
  '\u00B7': '.',                 // middle dot
  '\u2026': '...',               // ellipsis → three dots
};

// ─── INVISIBLE UNICODE ────────────────────────────────────────────────────────
// Characters that should always be removed
const INVISIBLE_RE = /[\u200B\u200C\u200D\u200E\u200F\u2028\u2029\uFEFF\u00AD\u00A0\u202F\u205F\u2060]/g;

// ─── BENGALI DANDA NORMALIZATION ──────────────────────────────────────────────
const DANDA_RE = /\u0964/g;  // Bengali full stop (।) → period

// ─── BENGALI DIGIT MAP ────────────────────────────────────────────────────────
function bengaliToAscii(str) {
  if (!str) return str;
  return str.replace(/[০-৯]/g, ch => String(ch.codePointAt(0) - 0x09E6));
}

// ─── MATH RANGE PROTECTION ────────────────────────────────────────────────────
const LATEX_BLOCK_RE = /(\$\$[\s\S]*?\$\$|\$[^$\n]*?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g;

// ─── LINE BOUNDARY GUARDS ─────────────────────────────────────────────────────
// Lines starting these patterns must NEVER be joined with the previous line
const QUESTION_HEADER_RE = /^(?:Question|Ques\.?|Q\.?\s*|প্রশ্ন\s*|প্র\.?\s*|No\.?\s*)\d{1,3}[\s\.):\-]|^\d{1,3}[\.):\-]\s+[^\s]/i;
const OPTION_LABEL_RE    = /^[\(\[]?\s*(?:[A-Da-dকখগঘ১-৪]|i{1,4}|I{1,4}|IV|vi{0,2})\s*[\)\]\.:](?!\d)\s*/;
const TERMINAL_PUNCT_RE  = /[.?!;:\)\]$\\]$/;

// ─── MAIN CLASS ───────────────────────────────────────────────────────────────

class OCRNormalizer {

  /**
   * Full normalization pipeline for raw OCR text.
   * Safe to call on Mathpix text or latex fields.
   *
   * @param {string} text
   * @returns {string}
   */
  static normalizeText(text) {
    if (!text || typeof text !== 'string') return '';
    let s = text;

    // 1. Line ending normalization
    s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 2. Invisible Unicode removal
    s = s.replace(INVISIBLE_RE, '');

    // 3. Fullwidth punctuation normalization (outside math blocks only)
    s = this._applyOutsideMath(s, raw => {
      let r = raw;
      for (const [from, to] of Object.entries(FULLWIDTH_MAP)) {
        if (r.includes(from)) r = r.split(from).join(to);
      }
      return r;
    });

    // 4. Bengali punctuation: danda → period
    s = s.replace(DANDA_RE, '.');

    // 5. Unicode space normalization
    s = s.replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ');

    // 6. Bengali digit → ASCII digit
    s = bengaliToAscii(s);

    // 7. Multiple space/tab collapse (but preserve newlines)
    s = s.replace(/[ \t]+/g, ' ');

    // 8. Excessive blank lines
    s = s.replace(/\n{3,}/g, '\n\n');

    // 9. Broken OCR number repair: "11 . Q" → "11. Q"
    s = s.replace(/(^|\n)(\s*)(\d+)\s+\.\s+/g, (_, nl, ws, num) => `${nl}${ws}${num}. `);

    // 10. Control character removal (except \n, \t)
    s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // 11. Unicode replacement character
    s = s.replace(/\uFFFD/g, '?');

    // 12. Mathematical operator normalization (outside math blocks)
    s = this._normalizeMathOperators(s);

    // 13. Smart line joining
    s = this._smartJoinLines(s);

    return s.trim();
  }

  /**
   * Clean a single parsed question text (post-parse cleanup).
   * Lighter than normalizeText — only cosmetic fixes.
   */
  static cleanQuestionText(text) {
    if (!text || typeof text !== 'string') return '';
    let s = text;

    // Collapse spaces
    s = s.replace(/[ \t]+/g, ' ');

    // Fix 4+ dots not being ellipsis
    s = s.replace(/\.{4,}/g, '...');

    // Remove dangling backslash at end
    s = s.replace(/\\+$/, '');

    // Collapse blank lines inside question
    s = s.replace(/\n{3,}/g, '\n\n');

    // Uppercase option letter references in text body
    // e.g. "between (c) and (d)" → "between (C) and (D)"  (only after keywords)
    s = s.replace(/((?:between|and|or|option|answer|choose|select)\s+)\(([a-d])\)/gi,
      (_, pre, label) => `${pre}(${label.toUpperCase()})`);

    return s.trim();
  }

  // ─── PRIVATE: APPLY TRANSFORMATION OUTSIDE MATH ───────────────────────────

  /**
   * Apply a transformation function to text segments that are OUTSIDE
   * any LaTeX math block. Math content is passed through unchanged.
   */
  static _applyOutsideMath(text, transformFn) {
    const parts = [];
    let lastIdx  = 0;
    LATEX_BLOCK_RE.lastIndex = 0;

    let m;
    while ((m = LATEX_BLOCK_RE.exec(text)) !== null) {
      // Transform the non-math segment before this block
      parts.push(transformFn(text.slice(lastIdx, m.index)));
      // Preserve the math block verbatim
      parts.push(m[0]);
      lastIdx = m.index + m[0].length;
    }
    // Transform remaining non-math text
    parts.push(transformFn(text.slice(lastIdx)));

    return parts.join('');
  }

  // ─── PRIVATE: MATHEMATICAL OPERATOR NORMALIZATION ─────────────────────────

  static _normalizeMathOperators(text) {
    return this._applyOutsideMath(text, segment => {
      let s = segment;
      // Unicode minus → ASCII hyphen (outside dollar blocks already handled above)
      s = s.replace(/\u2212/g, '-');
      // Collapse 3+ equals/stars used as separators (decorative)
      s = s.replace(/={3,}/g, '=');
      s = s.replace(/\*{3,}/g, '...');
      return s;
    });
  }

  // ─── PRIVATE: SMART LINE JOINING ──────────────────────────────────────────

  /**
   * Join continuation lines that are clearly part of the same sentence,
   * while protecting question boundaries, option label lines, and LaTeX blocks.
   */
  static _smartJoinLines(text) {
    const lines  = text.split('\n');
    const result = [];

    for (let i = 0; i < lines.length; i++) {
      const line    = lines[i];
      const trimmed = line.trim();

      if (result.length === 0) {
        result.push(line);
        continue;
      }

      const prev        = result[result.length - 1];
      const prevTrimmed = prev.trim();

      // Never merge if this line starts a new question or option
      if (QUESTION_HEADER_RE.test(trimmed) || OPTION_LABEL_RE.test(trimmed)) {
        result.push(line);
        continue;
      }

      // Never merge if the previous line ends with terminal punctuation
      if (TERMINAL_PUNCT_RE.test(prevTrimmed)) {
        result.push(line);
        continue;
      }

      // Never merge blank lines
      if (!trimmed || !prevTrimmed) {
        result.push(line);
        continue;
      }

      // Merge if the current line starts with lowercase, digit, or math char
      // AND the prev line does NOT end with a complete mathematical expression
      if (/^[a-z0-9\\\(\$\[]/.test(trimmed)) {
        // LaTeX line continuation (prev ends with \\)
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
