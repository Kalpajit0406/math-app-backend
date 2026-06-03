/**
 * FillInBlankParser
 *
 * PURPOSE:
 *   Parse fill-in-the-blank / completion-type questions.
 *   DO NOT fabricate MCQ options.
 *   DO NOT force them through the MCQ parser.
 *
 * INPUT:
 *   A single segment of text that has been classified as FILL type.
 *
 * OUTPUT:
 *   {
 *     question: string,         // Full question text with blanks preserved
 *     blanks: string[],         // Positions/hints for each blank (if extractable)
 *     blankCount: number,       // Number of blanks detected
 *     options: [],              // Always empty — no fabricated MCQ options
 *     format: 'fill_in_blank',
 *     parserConfidence: number, // 0.0 – 1.0
 *   }
 */

'use strict';

// ─── BLANK PLACEHOLDER PATTERNS ───────────────────────────────────────────────
// These are the ways blanks appear in scanned exam books.
const BLANK_PATTERNS = [
  /_{4,}/g,          // ______ (4+ underscores)
  /\.{4,}/g,         // ...... (4+ dots)
  /\. \. \. ?\.?/g,  // . . . .
  /\[___+\]/g,       // [___]
  /\(\s*\)/g,        // ( )
];

// ─── ANSWER HINT EXTRACTION ───────────────────────────────────────────────────
// Some fill questions embed the answer in parentheses after the blank: ____ (Hint)
const INLINE_HINT_PATTERN = /_{4,}\s*\(([^)]{1,40})\)/g;

class FillInBlankParser {

  /**
   * Parse a fill-in-the-blank segment.
   *
   * @param {string} segmentText - Isolated question segment text
   * @returns {FillResult}
   */
  static parse(segmentText) {
    if (!segmentText || !segmentText.trim()) {
      return this._empty();
    }

    const text = segmentText.trim();

    // ── Count blanks ────────────────────────────────────────────────────────
    let blankCount = 0;
    for (const pattern of BLANK_PATTERNS) {
      const matches = text.match(pattern);
      if (matches) blankCount += matches.length;
    }

    // ── Extract inline hints ────────────────────────────────────────────────
    const hints = [];
    let hintMatch;
    const hintRegex = new RegExp(INLINE_HINT_PATTERN.source, 'g');
    while ((hintMatch = hintRegex.exec(text)) !== null) {
      hints.push(hintMatch[1].trim());
    }

    // ── Clean the question text ─────────────────────────────────────────────
    // Remove leading question number if present (e.g. "5. ____")
    const questionText = text
      .replace(/^\d{1,3}[\.\)]\s*/, '')
      .trim();

    // ── Confidence ──────────────────────────────────────────────────────────
    // High if blanks were found; lower if we only detected fill by section heading
    const parserConfidence = blankCount > 0 ? 0.90 : 0.65;

    return {
      question: questionText,
      blanks: hints,
      blankCount: blankCount > 0 ? blankCount : 1, // at least 1
      options: [],
      format: 'fill_in_blank',
      parserConfidence,
      diagnostics: {
        rawInput: segmentText,
        blankCount,
        hints,
      },
    };
  }

  // ─── PRIVATE ───────────────────────────────────────────────────────────────

  static _empty() {
    return {
      question: '',
      blanks: [],
      blankCount: 0,
      options: [],
      format: 'fill_in_blank',
      parserConfidence: 0,
      diagnostics: { rawInput: '', blankCount: 0, hints: [] },
    };
  }
}

module.exports = { FillInBlankParser };
