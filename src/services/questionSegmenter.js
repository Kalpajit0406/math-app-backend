/**
 * QuestionSegmenter — Phase 2: Question Boundary Detection
 *
 * DESIGN PRINCIPLES:
 *   - Never let question NUMBER become part of questionText.
 *   - Never merge content from two different questions.
 *   - Support Bengali and English numbering concurrently.
 *   - Preserve LaTeX blocks intact across line joins.
 *   - Handle OCR line-breaks mid-sentence gracefully.
 *   - Three-pass strategy: pre-split → header detection → paragraph assembly.
 *
 * SUPPORTS:
 *   Standard:  1.  1)  1:  Q1.  Q.1  No. 1  Question 1
 *   Bengali:   ১.  ১)  প্রশ্ন ১  প্র. ১
 *   Mixed:     1–20 as ASCII (Bengali digits normalised before matching)
 */

'use strict';

// ─── BENGALI DIGIT NORMALIZER ─────────────────────────────────────────────────
function bengaliToAscii(str) {
  if (!str) return str;
  return str.replace(/[০-৯]/g, ch => String(ch.codePointAt(0) - 0x09E6));
}

// ─── MATH RANGE FINDER ───────────────────────────────────────────────────────
// Finds all LaTeX inline/display blocks so we never split inside them.
function getMathRanges(text) {
  const ranges = [];
  if (!text) return ranges;
  const re = /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|(?<!\$)\$[^$\n]*?\$(?!\$)/gs;
  let m;
  while ((m = re.exec(text)) !== null) {
    ranges.push({ start: m.index, end: m.index + m[0].length });
  }
  return ranges;
}

function isInsideMath(pos, ranges) {
  return ranges.some(r => pos >= r.start && pos < r.end);
}

// ─── QUESTION HEADER PATTERNS ─────────────────────────────────────────────────
// Order matters: most specific first.
const HEADER_PATTERNS = [
  // "Question 12:"  "Q. 12 -"  "Q12."
  /^(?:Question|Ques\.?|Q\.?\s*)(\d{1,3})[\s\.):\-]/i,
  // Bengali prefix: "প্রশ্ন 12"  "প্র. 12"
  /^(?:প্রশ্ন|প্র\.?)\s*\.?\s*(\d{1,3})[\s\.):\-]?/,
  // "No. 12"
  /^No\.?\s*(\d{1,3})[\s\.):\-]/i,
  // "12. text"  "12) text"  "12: text"  (number followed by delimiter then non-digit)
  /^(\d{1,3})[\.):\-]\s+(?!\d)/,
];

// Option label pattern — lines starting this way are NEVER question headers
const OPTION_LINE_RE = /^[\(\[]?\s*(?:[A-Da-dকখগঘ১-৪i]{1,4}|I{1,4}|IV|vi{0,2})\s*[\)\]\.:](?!\d)/;

/**
 * Try to detect a question header at the start of `line`.
 * Returns { number: string } or null.
 * `currentNumber` is the last known question number (for successor validation).
 */
function detectHeader(line, currentNumber) {
  const norm = bengaliToAscii(line.trim());

  // Never treat option lines as headers
  if (OPTION_LINE_RE.test(norm)) return null;

  for (const pattern of HEADER_PATTERNS) {
    const m = norm.match(pattern);
    if (m) {
      const num = parseInt(m[1], 10);
      // Sanity: question numbers are 1–999
      if (num < 1 || num > 999) continue;
      // If we have a current number and this is neither successor nor a later number, skip
      if (currentNumber !== null) {
        if (num < currentNumber && num !== 1) continue;  // going backwards (not a page restart)
      }
      return { number: String(num) };
    }
  }
  return null;
}

// ─── PRE-SPLIT LOOKAHEAD PATTERN ──────────────────────────────────────────────
// Splits text at positions where a new question header starts,
// even mid-line (e.g. after a closing '$' in Mathpix output).
const LOOKAHEAD_SPLIT = /(?:\n|[.?!]\s+|(?<=\$))(?=(?:(?:Question|Ques\.?|Q\.?\s*|প্রশ্ন\s*|প্র\.?\s*|No\.?\s*)\d{1,3}[\s\.):\-]|\d{1,3}[\.):\-]\s+)(?!\d))/gi;

// ─── MAIN CLASS ───────────────────────────────────────────────────────────────

class QuestionSegmenter {

  /**
   * Segment pre-cleaned text into individual question blocks.
   *
   * @param {string} text - Clean, noise-filtered text (output of PageLayoutAnalyzer)
   * @returns {Segment[]}  Each: { text, number, rawHeader, startIndex, endIndex }
   */
  static segment(text) {
    if (!text || !text.trim()) return [];

    // Normalise Bengali digits so patterns match consistently
    const normalized = bengaliToAscii(text);

    // ── PASS 1: Pre-split at question boundaries ───────────────────────────
    const rawBlocks = normalized.split(LOOKAHEAD_SPLIT).filter(b => b && b.trim());

    const segments = [];
    let currentSeg = null;
    let charCursor  = 0;
    let lastQNum    = null;

    const flushSegment = (endIdx) => {
      if (!currentSeg) return;
      const segText = currentSeg.lines.join('\n').trim();
      if (segText.length > 3) {  // discard tiny fragments
        segments.push({
          text:       segText,
          number:     currentSeg.number,
          rawHeader:  currentSeg.rawHeader,
          startIndex: currentSeg.startIndex,
          endIndex:   endIdx,
        });
      }
      currentSeg = null;
    };

    // ── PASS 2: Line-by-line header detection per block ────────────────────
    for (const block of rawBlocks) {
      if (!block.trim()) { charCursor += block.length + 1; continue; }

      const mathRanges = getMathRanges(block);
      const lines = block.split('\n');
      let blockCursor = 0;

      for (const line of lines) {
        const lineStart = charCursor + blockCursor;
        blockCursor += line.length + 1;

        // Never split inside a LaTeX block
        if (isInsideMath(lineStart, mathRanges)) {
          if (currentSeg) currentSeg.lines.push(line);
          continue;
        }

        const header = detectHeader(line, lastQNum !== null ? parseInt(lastQNum, 10) : null);

        if (header) {
          // A new question begins — flush the previous
          const hasContent = currentSeg &&
            currentSeg.lines.some(l => l.trim().length > 0);
          const hasOptions = currentSeg &&
            currentSeg.lines.some(l => OPTION_LINE_RE.test(l.trim()));

          if (!currentSeg || hasContent || hasOptions) {
            flushSegment(lineStart - 1);
            currentSeg = {
              number:     header.number,
              rawHeader:  line.trim(),
              startIndex: lineStart,
              lines:      [line],
            };
            lastQNum = header.number;
            continue;
          }
        }

        // Continuation line — append to current segment
        if (!currentSeg) {
          currentSeg = {
            number:     null,
            rawHeader:  '',
            startIndex: lineStart,
            lines:      [line],
          };
        } else {
          currentSeg.lines.push(line);
        }
      }

      charCursor += block.length + 1;
    }

    // Flush last segment
    if (currentSeg) {
      flushSegment(text.length);
    }

    // Fallback: return entire text as one segment if nothing was parsed
    if (segments.length === 0) {
      return [{
        text:       text.trim(),
        number:     null,
        rawHeader:  '',
        startIndex: 0,
        endIndex:   text.length,
      }];
    }

    // ── PASS 3: Strip question number from question text ──────────────────
    // The number is already stored in seg.number, remove it from the text body.
    return segments.map(seg => {
      const cleaned = this._stripQuestionNumber(seg.text, seg.number);
      return { ...seg, text: cleaned };
    });
  }

  /**
   * Remove the leading question number/header from the text body.
   * The number is stored separately in seg.number.
   */
  static _stripQuestionNumber(text, number) {
    if (!text || !number) return text;
    // Match the same header patterns at the very start
    const norm = bengaliToAscii(text.trimStart());
    const stripPatterns = [
      new RegExp(`^(?:Question|Ques\\.?|Q\\.?\\s*)${number}[\\s\\.\\):\\-]+`, 'i'),
      new RegExp(`^(?:প্রশ্ন|প্র\\.?)\\s*\\.?\\s*${number}[\\s\\.\\):\\-]*`, ''),
      new RegExp(`^No\\.?\\s*${number}[\\s\\.\\):\\-]+`, 'i'),
      new RegExp(`^${number}[\\.):\\-]\\s+`),
    ];
    for (const p of stripPatterns) {
      const m = norm.match(p);
      if (m) {
        // Remove matched prefix from original text (preserve original casing/script)
        return text.slice(m[0].length).trim();
      }
    }
    return text;
  }
}

module.exports = { QuestionSegmenter };
