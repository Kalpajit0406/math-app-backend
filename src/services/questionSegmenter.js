/**
 * QuestionSegmenter — Phase 2: Question Boundary Detection
 *
 * ══════════════════════════════════════════════════════════════════════════
 * REDESIGN GOALS (v3):
 *   - Recognize Bengali numerals (১২৩...) AND English numerals (123...)
 *   - Recognize all numbering styles: '1)', '1.', '(1)', '১)', '১.', '(১)'
 *   - Support multi-column page layouts (left column then right column)
 *   - Support indented question starts
 *   - Provide verbose diagnostic logging
 *   - NEVER return the entire page as one question
 *   - NEVER let question number bleed into questionText
 *   - Preserve LaTeX blocks intact
 *
 * SUPPORTED NUMBERING FORMATS:
 *   English:  1.  1)  1:  (1)  Q1.  Q.1  No.1  Question 1
 *   Bengali:  ১.  ১)  (১)  প্রশ্ন ১  প্র.১
 *   Mixed:    OCR may produce Bengali digits as ASCII — both are matched
 * ══════════════════════════════════════════════════════════════════════════
 */

'use strict';

// ─── BENGALI ↔ ASCII DIGIT CONVERSION ─────────────────────────────────────────
function bengaliToAscii(str) {
  if (!str) return str;
  return str.replace(/[০-৯]/g, ch => String(ch.codePointAt(0) - 0x09E6));
}

// ─── MATH RANGE FINDER ───────────────────────────────────────────────────────
// Returns ranges of LaTeX math spans so we never split inside them.
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
// Each pattern must capture group 1 = the question number.
// Ordered most-specific first to avoid premature matching.
const HEADER_PATTERNS = [
  // "Question 12:"  "Q. 12"  "Q12."
  /^(?:Question|Ques\.?|Q\.?\s*)(\d{1,3})[\s\.):\-]/i,

  // Bengali keyword prefix: "প্রশ্ন ১২"  "প্র. ১২"
  /^(?:প্রশ্ন|প্র\.?)\s*\.?\s*(\d{1,3})[\s\.):\-]?/,

  // ── REAL BOOK FORMAT (Math Saha / WB board books) ─────────────────────
  // ›)1  ›) 1  >)1  >） 1  — arrow + paren prefix before number
  // Mathpix OCRs the Bengali angular bracket ›) as one of: ›) >) »)
  /^[›»>\u203a]\)?\s*(\d{1,3})(?:[\s\.):\-]|$)/,

  // ›)১  Bengali digit version of the above
  /^[›»>\u203a]\)?\s*([০-৯]{1,3})(?:[\s\.):\-]|$)/,

  // )1  — just closing-paren + number (when the › is dropped by OCR)
  /^\)\s*(\d{1,3})(?:[\s\.):\-]|$)/,

  // ── STANDARD FORMATS ──────────────────────────────────────────────────
  // "No. 12"  "No.12"  — full word boundary so "Not" doesn't match
  /^No\.?\s+(\d{1,3})[\s\.):\-]/i,

  // (12)  text — parenthesised number
  // Requires \d inside parens so (A) (B) (a) (ক) don't match
  /^\((\d{1,3})\)\s+(?!\d)/,

  // 12. text   12) text   12: text
  // Must be followed by space + non-digit (not a decimal like 3.14 or ratio like 1/2)
  /^(\d{1,3})[\.)\:]\s+(?!\d)/,

  // 12. at end-of-line (question number alone on a line before the question body)
  /^(\d{1,3})[\.):]?\s*$/,
];

// Option label pattern — these lines must NEVER be treated as question headers
// Matches: (A) (B) (C) (D)  (a) (b) (c) (d)  (ক) (খ) (গ) (ঘ)  A. B.  i. ii.
const OPTION_LINE_RE = /^[\(\[]?\s*(?:[A-Da-dকখগঘi]{1,2}|I{1,3}|IV)\s*[\)\]\.\:](?!\d)(?=\s|$|[^\d])/;

/**
 * Detect if a number looks like an OCR misread of a Roman numeral.
 * II → 11, III → 111, IIII → 1111, etc.
 * These appear when OCR sees thin vertical strokes as "1".
 */
function isRomanNumeralFalsePositive(num) {
  // All-ones numbers: 1, 11, 111, 1111 look like I, II, III, IIII
  // But 1 is always valid (could be question #1)
  const s = String(num);
  if (s.length > 1 && /^1+$/.test(s)) return true;
  return false;
}

/**
 * Try to detect a question header at the start of a line.
 * Returns { number: string, style: string } or null.
 * `currentNumber` prevents accepting numbers that jump backwards.
 *
 * IMPORTANT: Mathpix sometimes prepends Devanagari/garbage chars before
 * the actual question number. We scan the first 25 chars for a number.
 */
function detectHeader(line, currentNumber) {
  let norm = bengaliToAscii(line.trim());
  if (!norm) return null;

  // Never treat option lines as headers
  if (OPTION_LINE_RE.test(norm)) return null;

  // Strip leading non-Bengali, non-English, non-digit garbage (e.g. Devanagari)
  // This handles OCR prepending like "अठिक 1. question..." → "1. question..."
  // Only strip if there's a digit within the first 25 chars
  const earlyDigit = norm.match(/^.{0,24}?(\d{1,3}[\.):\s])/);
  if (earlyDigit && earlyDigit.index > 0) {
    // Check if the prefix is all non-useful characters (Devanagari, symbols, spaces)
    const prefix = norm.slice(0, earlyDigit.index);
    const hasUsefulBengali = /[\u0980-\u09FF]{3,}/.test(prefix);
    if (!hasUsefulBengali) {
      // Strip the garbage prefix — the real line starts at the digit
      norm = norm.slice(earlyDigit.index);
    }
  }

  // Must start with a digit, 'Q', 'N', '(', Bengali keyword, or ›/>/» arrow
  const startsLike = /^[\d\(QNqn›»>\u203aপপ্র]/.test(norm);
  if (!startsLike) return null;

  for (const pattern of HEADER_PATTERNS) {
    const m = norm.match(pattern);
    if (!m) continue;

    const num = parseInt(m[1], 10);
    if (num < 1 || num > 500) continue;  // sanity range

    // Reject Roman numeral false positives (11=II, 111=III, etc.)
    if (isRomanNumeralFalsePositive(num)) {
      console.log(`[QuestionSegmenter:ROMAN_FILTER] Rejected num=${num} — looks like OCR misread of Roman numeral`);
      continue;
    }

    // Validate continuity
    if (currentNumber !== null) {
      // Reject backward jumps (unless wrapping back to 1)
      if (num < currentNumber && num !== 1) continue;
      // Reject impossible forward jumps (>30 at once — likely OCR garbage)
      if (num > currentNumber + 30) {
        console.log(`[QuestionSegmenter:JUMP_FILTER] Rejected num=${num} — impossible jump from ${currentNumber}`);
        continue;
      }
    }

    return { number: String(num), style: pattern.toString().slice(0, 30) };
  }
  return null;
}

// ─── PRE-SPLIT LOOKAHEAD PATTERN ──────────────────────────────────────────────
// Splits text at positions where a new question header starts.
// We ONLY split at newlines or after math block end ($).
// We do NOT split at [.?!]\s+ because that breaks "No. 3 ..." style headers.
const LOOKAHEAD_SPLIT = /(?:\n|(?<=\$))(?=(?:(?:Question|Ques\.?|Q\.?\s*|প্রশ্ন\s*|প্র\.?\s*|No\.?\s+)?\(?(?:\d{1,3})\)?[\.):\s](?!\d)))/gi;

// ─── VERBOSE LOGGER ───────────────────────────────────────────────────────────
function log(tag, msg) {
  console.log(`[QuestionSegmenter:${tag}] ${msg}`);
}

// ─── MAIN CLASS ───────────────────────────────────────────────────────────────

class QuestionSegmenter {

  /**
   * Segment pre-cleaned text into individual question blocks.
   *
   * @param {string} text  - Clean, noise-filtered text (output of PageLayoutAnalyzer)
   * @param {object} opts
   * @param {string} opts.columnLayout  - '1-col' | '2-col' | 'multi-col'
   * @param {boolean} opts.verbose      - Enable diagnostic logging
   * @returns {Segment[]}  Each: { text, number, rawHeader, startIndex, endIndex }
   */
  static segment(text, opts = {}) {
    const { columnLayout = '1-col', verbose = false } = opts;

    if (!text || !text.trim()) return [];

    if (verbose) log('ENTRY', `Input length=${text.length}, columnLayout=${columnLayout}`);

    // Normalize Bengali digits so all patterns work uniformly
    const normalized = bengaliToAscii(text);

    // ── PASS 1: Pre-split at likely question boundaries ────────────────────
    const rawBlocks = normalized
      .split(LOOKAHEAD_SPLIT)
      .filter(b => b && b.trim());

    if (verbose) log('PASS1', `Pre-split produced ${rawBlocks.length} raw block(s)`);

    const segments   = [];
    let currentSeg   = null;
    let charCursor   = 0;
    let lastQNum     = null;
    let headerCount  = 0;

    const flushSegment = (endIdx) => {
      if (!currentSeg) return;
      const segText = currentSeg.lines.join('\n').trim();
      if (segText.length > 3) {
        segments.push({
          text:       segText,
          number:     currentSeg.number,
          rawHeader:  currentSeg.rawHeader,
          startIndex: currentSeg.startIndex,
          endIndex:   endIdx,
        });
        if (verbose) log('FLUSH', `Seg #${currentSeg.number ?? '?'}, chars=${segText.length}`);
      }
      currentSeg = null;
    };

    // ── PASS 2: Line-by-line header detection ─────────────────────────────
    for (const block of rawBlocks) {
      if (!block.trim()) { charCursor += block.length + 1; continue; }

      const mathRanges = getMathRanges(block);
      const lines = block.split('\n');
      let blockCursor = 0;

      for (const line of lines) {
        const lineStart = charCursor + blockCursor;
        blockCursor += line.length + 1;

        // Never split inside a LaTeX math block
        if (isInsideMath(lineStart, mathRanges)) {
          if (currentSeg) currentSeg.lines.push(line);
          continue;
        }

        const header = detectHeader(line, lastQNum !== null ? parseInt(lastQNum, 10) : null);

        if (header) {
          headerCount++;
          flushSegment(lineStart - 1);
          currentSeg = {
            number:     header.number,
            rawHeader:  line.trim(),
            startIndex: lineStart,
            lines:      [line],
          };
          lastQNum = header.number;
          if (verbose) log('HEADER', `Detected Q#${header.number} at char ${lineStart} (${header.style})`);
          continue;
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
    if (currentSeg) flushSegment(text.length);

    if (verbose) {
      log('PASS2', `Headers detected: ${headerCount}, Segments after PASS2: ${segments.length}`);
    }

    // ── PASS 3: Fallback — attempt alternative splitting by empty-line groups
    if (segments.length <= 1 && text.trim().length > 400) {
      if (verbose) log('PASS3', 'Fewer than 2 segments detected — attempting paragraph split fallback');
      const fallback = this._paragraphFallback(text, verbose);
      if (fallback.length > 1) {
        if (verbose) log('PASS3', `Paragraph fallback produced ${fallback.length} segments`);
        return fallback;
      }
    }

    // ── Final: strip question number prefix from text body ─────────────────
    const stripped = segments.map(seg => {
      const cleaned = this._stripQuestionNumber(seg.text, seg.number);
      return { ...seg, text: cleaned };
    });

    if (verbose) {
      log('RESULT', `${stripped.length} segment(s) produced`);
      stripped.forEach((s, i) =>
        log('SEG', `  [${i}] Q#${s.number ?? 'null'}, chars=${s.text.length}, preview="${s.text.slice(0, 60).replace(/\n/g,' ')}..."`)
      );
    }

    return stripped;
  }

  // ─── PARAGRAPH-BASED FALLBACK SPLITTER ─────────────────────────────────────
  // Used when the primary header detector finds 0–1 questions on a page that
  // clearly has multiple paragraphs. Tries to split by double-newline or
  // MCQ option boundaries.
  static _paragraphFallback(text, verbose = false) {
    const paragraphs = text
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(p => p.length > 20);

    if (verbose) log('PARA_FALLBACK', `${paragraphs.length} paragraph(s) from double-newline split`);

    // If paragraphs contain option patterns, use them as question boundaries
    const hasOptions = paragraphs.some(p =>
      /[\(\[]?\s*[ABCDabcd]\s*[\)\]\.]/.test(p)
    );

    if (!hasOptions || paragraphs.length < 2) {
      // Return whole text as single unnumbered segment (with number=null)
      return [{
        text:       text.trim(),
        number:     null,
        rawHeader:  '',
        startIndex: 0,
        endIndex:   text.length,
      }];
    }

    // Each paragraph with options is treated as its own question
    let offset = 0;
    return paragraphs.map((p, i) => {
      const start = text.indexOf(p, offset);
      const end   = start + p.length;
      offset = end;
      return {
        text:       p,
        number:     String(i + 1),
        rawHeader:  p.split('\n')[0].slice(0, 60),
        startIndex: start,
        endIndex:   end,
      };
    });
  }

  // ─── STRIP QUESTION NUMBER PREFIX ───────────────────────────────────────────
  // The number is stored in seg.number — remove it from the text body.
  static _stripQuestionNumber(text, number) {
    if (!text || !number) return text;

    const norm = bengaliToAscii(text.trimStart());

    const stripPatterns = [
      // Real WB book: "›)N"  ">)N"  "»)N"  ")N"  (arrow + paren + number)
      new RegExp(`^[›»>\\u203a]\\)?\\s*${number}[\\s\\.\\):\\-]*`),
      // "Question N"  "Q. N"  "Q N"
      new RegExp(`^(?:Question|Ques\\.?|Q\\.?\\s*)${number}[\\s\\.\\):\\-]+`, 'i'),
      // Bengali: "প্রশ্ন N"  "প্র. N"
      new RegExp(`^(?:প্রশ্ন|প্র\\.?)\\s*\\.?\\s*${number}[\\s\\.\\):\\-]*`, ''),
      // "No. N"
      new RegExp(`^No\\.?\\s*${number}[\\s\\.\\):\\-]+`, 'i'),
      // "(N) "
      new RegExp(`^\\(${number}\\)\\s+`),
      // "N. "  "N) "  "N: "
      new RegExp(`^${number}[\\.\\)\\:]\\s+`),
      // "N." alone at start (question number on its own line)
      new RegExp(`^${number}[\\.):]?\\s*\\n`),
    ];

    for (const p of stripPatterns) {
      const m = norm.match(p);
      if (m) {
        return text.slice(m[0].length).trim();
      }
    }

    return text.trim();
  }

  /**
   * Diagnostic: count how many question boundaries can be detected in text.
   * Useful for pre-validation before running the full segment().
   */
  static countDetectableBoundaries(text) {
    if (!text) return 0;
    const norm = bengaliToAscii(text);
    const lines = norm.split('\n');
    let count = 0;
    let lastNum = null;
    const boundaries = [];

    for (let i = 0; i < lines.length; i++) {
      const header = detectHeader(lines[i], lastNum);
      if (header) {
        count++;
        lastNum = parseInt(header.number, 10);
        boundaries.push({ lineIndex: i, number: header.number, line: lines[i].slice(0, 80) });
      }
    }

    return { count, boundaries };
  }
}

module.exports = { QuestionSegmenter };
