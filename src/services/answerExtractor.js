/**
 * AnswerExtractor — Phase 6: Answer Badge Detection
 *
 * DETECTS printed answer indicators:
 *   - "Ans: (B)"      "Answer: C"     "উত্তর: (খ)"
 *   - "Correct: 3"    "Key: (ii)"
 *   - Answer key page grids: "5. B  6. C  7. A"
 *
 * STORES BOTH:
 *   correctOption : canonical A|B|C|D label
 *   correctAnswer : full option text (resolved from options array if possible)
 *
 * NEVER infers from option order.
 * NEVER guesses.
 * Returns null fields if no answer badge is found.
 */

'use strict';

// ─── LABEL CANONICALIZATION ───────────────────────────────────────────────────
const LABEL_MAP = {
  // Latin
  'a': 'A', 'b': 'B', 'c': 'C', 'd': 'D',
  'A': 'A', 'B': 'B', 'C': 'C', 'D': 'D',
  // Bengali alphabetic
  'ক': 'A', 'খ': 'B', 'গ': 'C', 'ঘ': 'D',
  // Bengali numeric
  '১': 'A', '২': 'B', '৩': 'C', '৪': 'D',
  // ASCII numeric
  '1': 'A', '2': 'B', '3': 'C', '4': 'D',
  // Roman
  'i': 'A', 'ii': 'B', 'iii': 'C', 'iv': 'D',
  'I': 'A', 'II': 'B', 'III': 'C', 'IV': 'D',
};

function canonicalize(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  return LABEL_MAP[trimmed] || LABEL_MAP[trimmed.toLowerCase()] || null;
}

// ─── INLINE ANSWER BADGE PATTERNS ────────────────────────────────────────────
// These appear inside or at the end of a question segment.
const INLINE_ANSWER_PATTERNS = [
  // "Ans: (B)"  "Ans. B"  "Answer: C"  "Answer : (D)"
  /\bAns(?:wer)?\.?\s*[:：]\s*[\(\[]?\s*([A-Da-dকখগঘ১২৩৪i-ivI-IV]{1,3})\s*[\)\]]?/i,
  // Bengali: "উত্তর: (খ)"  "উত্তরঃ গ"
  /উত্তর[ঃ:]?\s*[\(\[]?\s*([A-Da-dকখগঘ১২৩৪i-ivI-IV]{1,3})\s*[\)\]]?/,
  // "Correct option: B"  "Correct answer: (C)"
  /[Cc]orrect\s*(?:option|answer)?\.?\s*[:：]\s*[\(\[]?\s*([A-Da-dকখগঘ১২৩৪i-ivI-IV]{1,3})\s*[\)\]]?/i,
  // "Key: (ii)"
  /[Kk]ey\.?\s*[:：]\s*[\(\[]?\s*([A-Da-dকখগঘ১২৩৪i-ivI-IV]{1,3})\s*[\)\]]?/i,
];

// ─── ANSWER KEY GRID PATTERN ─────────────────────────────────────────────────
// For parsing answer-key pages: "1. A  2. B  3. C  ..."
const ANSWER_GRID_RE = /(\d{1,3})\s*[.):\s]\s*[\(\[]?\s*([A-Da-dকখগঘ১২৩৪i-ivI-IV]{1,3})\s*[\)\]]?/g;

// ─── MAIN CLASS ───────────────────────────────────────────────────────────────

class AnswerExtractor {

  /**
   * Extract the answer badge from a question segment.
   *
   * @param {string} segmentText - The question segment text
   * @param {Array}  options     - Parsed options [{label, text}]
   * @returns {{ correctOption: string|null, correctAnswer: string|null, source: string }}
   */
  static extractFromSegment(segmentText, options = []) {
    if (!segmentText) {
      return { correctOption: null, correctAnswer: null, source: 'none' };
    }

    // Try each inline pattern
    for (const pattern of INLINE_ANSWER_PATTERNS) {
      const m = segmentText.match(pattern);
      if (m && m[1]) {
        const canonical = canonicalize(m[1]);
        if (canonical) {
          const correctAnswer = this._resolveAnswerText(canonical, options);
          return {
            correctOption: canonical,
            correctAnswer,
            source: 'inline-badge',
          };
        }
      }
    }

    return { correctOption: null, correctAnswer: null, source: 'none' };
  }

  /**
   * Parse a full answer-key page text into a question-number → answer map.
   *
   * @param {string} text - Answer key page text
   * @returns {Map<number, string>}  Map of questionNumber → canonical label (A/B/C/D)
   */
  static parseAnswerKeyPage(text) {
    const map = new Map();
    if (!text) return map;

    ANSWER_GRID_RE.lastIndex = 0;
    const re = new RegExp(ANSWER_GRID_RE.source, 'g');
    let m;

    while ((m = re.exec(text)) !== null) {
      const qNum      = parseInt(m[1], 10);
      const canonical = canonicalize(m[2]);
      if (qNum > 0 && canonical) {
        map.set(qNum, canonical);
      }
    }

    return map;
  }

  /**
   * Apply pre-built answer key map to a set of parsed questions.
   * Modifies questions in-place.
   *
   * @param {object[]}         questions  - Parsed question objects
   * @param {Map<number,string>} keyMap   - From parseAnswerKeyPage()
   */
  static applyAnswerKey(questions, keyMap) {
    if (!Array.isArray(questions) || !keyMap || keyMap.size === 0) return;

    for (const q of questions) {
      if (q.correctOption) continue;  // already has an answer badge

      const numMatch = String(q.questionNumber || '').match(/(\d+)$/);
      if (!numMatch) continue;

      const qNum = parseInt(numMatch[1], 10);
      if (keyMap.has(qNum)) {
        const canonical = keyMap.get(qNum);
        q.correctOption = canonical;
        q.correctAnswer  = this._resolveAnswerText(canonical, q.options || []);
        q.answerSource   = 'answer-key-page';
      }
    }
  }

  // ─── PRIVATE ────────────────────────────────────────────────────────────────

  static _resolveAnswerText(canonicalLabel, options) {
    if (!Array.isArray(options)) return canonicalLabel;
    const opt = options.find(o => o.label === canonicalLabel);
    return (opt && opt.text && opt.text.trim()) ? opt.text.trim() : canonicalLabel;
  }
}

module.exports = { AnswerExtractor };
