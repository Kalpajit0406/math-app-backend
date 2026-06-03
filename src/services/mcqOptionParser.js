/**
 * MCQOptionParser — Production-Grade MCQ Extraction Engine
 *
 * CAPABILITIES:
 *   - Standard (A)(B)(C)(D) inline MCQs
 *   - Line-separated A. B. C. D. options
 *   - Bengali labels: ক. খ. গ. ঘ. / ১. ২. ৩. ৪.
 *   - Roman numeral options: (i)(ii)(iii)(iv)
 *   - Multi-line wrapped options
 *   - Math-only and text+math mixed questions
 *   - Inline option layouts (all options on one line)
 *   - Vertical option layouts (each option on its own line)
 *
 * PREVENTS:
 *   - Option bleed across questions
 *   - Cross-question contamination
 *   - Merged question detection
 *   - Placeholder question text fallback
 *
 * ARCHITECTURE:
 *   Three specialized parsers tried in priority order:
 *     1. detectInlineParen  — (A) text (B) text inline format
 *     2. detectLineBased    — line-by-line A. / A) / (A) format
 *     3. detectStructured   — explicit key:value format
 *
 *   Each parser returns { question, options, format } or null.
 *   The first non-null result with >= 2 valid options wins.
 */

'use strict';

// ─── LABEL NORMALISATION MAP ──────────────────────────────────────────────────
// Maps any option label variant → canonical index 0–3
const LABEL_INDEX_MAP = {
  // Latin
  'A': 0, 'B': 1, 'C': 2, 'D': 3,
  'a': 0, 'b': 1, 'c': 2, 'd': 3,
  // Numeric
  '1': 0, '2': 1, '3': 2, '4': 3,
  // Roman
  'i': 0, 'ii': 1, 'iii': 2, 'iv': 3,
  'I': 0, 'II': 1, 'III': 2, 'IV': 3,
  // Bengali alphabetic
  'ক': 0, 'খ': 1, 'গ': 2, 'ঘ': 3,
  // Bengali numeric
  '১': 0, '২': 1, '৩': 2, '৪': 3,
};

const CANONICAL_LABELS = ['A', 'B', 'C', 'D'];

// ─── OPTION DETECTION PATTERNS ────────────────────────────────────────────────

// Matches an option start label at the beginning of a string:
//   (A)  A.  A)  [A]  ক.  ক)  (ক)  i.  (i)  1.  (1)
// IMPORTANT: For numeric labels [1-4], we add a lookahead to prevent matching
// question headers like "3. What is..." — those start with uppercase + full word.
const OPT_START = /^[\(\[]?\s*(A|B|C|D|a|b|c|d|i{1,4}|I{1,4}|IV|iv|[ক-ঘ১-৪])\s*[\)\]\.\:](?!\d)\s*|^[\(\[]?\s*([1-4])\s*[\)\]\.\:](?!\d)\s*(?![A-Z\u0980-\u09FF][a-zA-Z\u0980-\u09FF]{3,})/;

// Matches lines that are clearly question headers (number + sentence)
// Used to prevent option parser from consuming question lines
const QUESTION_LINE_RE = /^\d{1,3}[\.):]\s+[A-Z\u0980-\u09FF].{5,}/;

// Inline: (A) ... (B) ... — captured as groups
const INLINE_PAREN = /(?<![A-Za-z0-9\\])[\(\[]\s*([ABCDabcdকখগঘ১২৩৪i-ivI-IV]{1,3})\s*[\)\]]\s*([\s\S]*?)(?=\s*(?<![A-Za-z0-9\\])[\(\[]\s*[ABCDabcdকখগঘ১২৩৪i-ivI-IV]{1,3}\s*[\)\]]|$)/g;

// Internal header: looks like the start of a new question (number + text) INSIDE a segment
// Used to truncate option bleed
const INTERNAL_Q_HEADER = /\n\s*(?:Question\s+\d+|Q\s*\d+|Q\d+|(?:[5-9]|\d{2,})\.)\s+/;

// ─── UTILITIES ────────────────────────────────────────────────────────────────

function bengaliToEnglish(str) {
  if (!str) return str;
  return str.replace(/[০-৯]/g, ch => String(ch.codePointAt(0) - 0x09E6));
}

/**
 * Normalize a raw option label to its canonical form (A/B/C/D).
 */
function canonicalize(rawLabel) {
  const idx = LABEL_INDEX_MAP[rawLabel] ?? LABEL_INDEX_MAP[rawLabel.toLowerCase()];
  return idx !== undefined ? CANONICAL_LABELS[idx] : null;
}

/**
 * Check if an option text has actual semantic content (not just symbols/whitespace).
 */
function hasContent(text) {
  if (!text) return false;
  const t = text.trim();
  if (t.length < 1) return false;
  // Must contain at least one alphanumeric, math symbol, or LaTeX command
  return /[a-zA-Z0-9\u0080-\uFFFF\$\\+\-\=]/.test(t);
}

/**
 * Build a normalized 4-element options array from a map of {label → text}.
 * Fills missing entries with empty string.
 */
function buildOptionsArray(optMap) {
  return CANONICAL_LABELS.map(label => ({
    label,
    text: (optMap[label] || '').trim(),
  }));
}

/**
 * Count the number of option slots that have actual content.
 */
function countFilledOptions(opts) {
  return opts.filter(o => hasContent(o.text)).length;
}

function getMathRanges(text) {
  const ranges = [];
  if (!text) return ranges;
  const displayMathRegex = /\$\$.*?\$\$/gs;
  let match;
  while ((match = displayMathRegex.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  const bracketMathRegex = /\\\[.*?\\\]/gs;
  while ((match = bracketMathRegex.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  const parenMathRegex = /\\\(.*?\\\)/gs;
  while ((match = parenMathRegex.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  const inlineMathRegex = /(?<!\$)\$.*?\$(?!\$)/gs;
  while ((match = inlineMathRegex.exec(text)) !== null) {
    const start = match.index;
    const end = match.index + match[0].length;
    const isOverlapping = ranges.some(r => (start >= r.start && start < r.end) || (end > r.start && end <= r.end));
    if (!isOverlapping) {
      ranges.push({ start, end });
    }
  }
  return ranges;
}

// ─── MAIN CLASS ───────────────────────────────────────────────────────────────

class MCQOptionParser {

  /**
   * Parse MCQ options from an isolated question segment.
   *
   * @param {string} segmentText
   * @returns {{ question: string, options: OptionObj[], format: string } | null}
   */
  static parse(segmentText) {
    if (!segmentText || typeof segmentText !== 'string') return null;

    let text = segmentText.trim();

    // ── Defensive: truncate if a subsequent question header leaked in ─────────
    const internalHeader = text.match(INTERNAL_Q_HEADER);
    if (internalHeader && internalHeader.index != null && internalHeader.index > 10) {
      text = text.substring(0, internalHeader.index).trim();
    }

    // ── Try parsers in priority order ──────────────────────────────────────
    const result =
      this._detectInlineParen(text)   ||
      this._detectLineBased(text)     ||
      this._detectStructured(text);

    if (!result) return null;

    // ── Post-processing: recover placeholder question text ────────────────
    if (!result.question || /^(?:Question\s*(?:Text)?|Q\.?No\.?)$/i.test(result.question.trim())) {
      const recovered = this._extractQuestionPreamble(text);
      if (recovered) result.question = recovered;
    }

    // Require at least 2 filled options to be a valid MCQ
    if (countFilledOptions(result.options) < 2) return null;

    return result;
  }

  // ─── PARSER 1: INLINE PARENTHESIS FORMAT ─────────────────────────────────
  // Handles: (A) first option (B) second option (C) third (D) fourth

  static _detectInlineParen(text) {
    const mathRanges = getMathRanges(text);
    const optMap = {};
    let firstMatchIndex = -1;

    // Reset regex lastIndex
    INLINE_PAREN.lastIndex = 0;
    const pattern = new RegExp(INLINE_PAREN.source, 'g');
    let m;

    while ((m = pattern.exec(text)) !== null) {
      const matchIndex = m.index;
      // Skip if inside math block
      const insideMath = mathRanges.some(r => matchIndex >= r.start && matchIndex < r.end);
      if (insideMath) continue;

      const canonical = canonicalize(m[1]);
      if (!canonical) continue;
      
      const optText = m[2].trim().replace(/\s+/g, ' ');
      if (!optMap[canonical] && hasContent(optText)) {
        optMap[canonical] = optText;
        if (firstMatchIndex === -1) firstMatchIndex = m.index;
      }
    }

    if (Object.keys(optMap).length < 2) return null;

    // Reconstruct question body from text before first option
    const questionText = firstMatchIndex > 0
      ? text.substring(0, firstMatchIndex).replace(/^\d{1,3}[\.\)]\s*/, '').trim()
      : '';

    return {
      question: questionText || '',
      options:  buildOptionsArray(optMap),
      format:   'inline-mcq',
    };
  }

  // ─── PARSER 2: LINE-BASED FORMAT ─────────────────────────────────────────
  // Handles:  A. text\nB. text\n  or  (A) text\n(B) text\n

  static _detectLineBased(text) {
    const lines = text
      .split('\n')
      .map(l => l.replace(/\r/g, '').trim())
      .filter(Boolean);

    const optMap  = {};
    const questionLines = [];
    let currentLabel = null;
    let firstOptionLineIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = line.match(OPT_START);

      if (m && !QUESTION_LINE_RE.test(line)) {
        // Only treat as option label if it's NOT a question-header line
        const rawLabel = m[1] || m[2]; // m[1] = letter/roman/bengali, m[2] = numeric
        const canonical = canonicalize(rawLabel);
        if (!canonical) {
          // Can't map label — treat as continuation
          if (currentLabel && optMap[currentLabel] !== undefined) {
            optMap[currentLabel] += ' ' + line;
          }
          continue;
        }

        currentLabel = canonical;
        const rest = line.slice(m[0].length).trim();
        optMap[currentLabel] = rest;

        if (firstOptionLineIdx === -1) firstOptionLineIdx = i;
      } else if (currentLabel !== null) {
        // Continuation of the current option (multi-line option)
        // Stop if it looks like a question header or section title
        if (/^\d{1,3}[\.\)]\s+[A-Z\u0980-\u09FF]/.test(line)) {
          // Looks like a new question — stop
          break;
        }
        optMap[currentLabel] += ' ' + line;
      } else {
        questionLines.push(line);
      }
    }

    if (Object.keys(optMap).length < 2) return null;

    // Reconstruct question text from lines before first option
    const questionText = questionLines
      .slice(0, firstOptionLineIdx === -1 ? questionLines.length : undefined)
      .join('\n')
      .replace(/^\d{1,3}[\.\)]\s*/, '')
      .trim();

    // Trim trailing continuation noise from options
    for (const k of Object.keys(optMap)) {
      optMap[k] = optMap[k].trim();
    }

    return {
      question: questionText,
      options:  buildOptionsArray(optMap),
      format:   'line-based',
    };
  }

  // ─── PARSER 3: STRUCTURED KEY-VALUE FORMAT ─────────────────────────────────
  // Handles rare: "question: ... options: A: ... B: ... C: ..."

  static _detectStructured(text) {
    const structured = [
      /question\s*[:\-]?\s*(.+?)\s*(?:options?|choice|answer)\s*[:\-]?\s*(.*)/is,
      /(\d+\.\s+.+?)\s*option\s*a\s*[:\-]?\s*(.+?)(?=option|choice|$)/is,
    ];

    for (const pattern of structured) {
      const match = text.match(pattern);
      if (!match) continue;

      const qText   = match[1].trim();
      const optPart = match[2].trim();
      const optLines = optPart.split(/\n/).filter(l => l.trim());
      const opts = [];
      const labels = CANONICAL_LABELS;

      for (const line of optLines) {
        const om = line.match(/^[\(\[]?([A-Da-dক-ঘ১-৪i-ivI-IV]{1,3})[\)\]\.\:\-\s]+(.+)$/);
        if (om) {
          const canonical = canonicalize(om[1]);
          if (canonical) opts.push({ label: canonical, text: om[2].trim() });
        }
      }

      if (opts.length < 2) continue;

      while (opts.length < 4) opts.push({ label: labels[opts.length], text: '' });

      return { question: qText, options: opts.slice(0, 4), format: 'structured' };
    }

    return null;
  }

  // ─── UTILITIES ───────────────────────────────────────────────────────────

  /**
   * Extract the preamble question text from the raw segment,
   * ignoring any lines that start with option labels.
   */
  static _extractQuestionPreamble(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const preamble = [];

    for (const line of lines) {
      if (OPT_START.test(line)) break; // hit first option — stop
      preamble.push(line);
    }

    const raw = preamble.join(' ').replace(/^\d{1,3}[\.\)]\s*/, '').trim();
    return raw || null;
  }
}

module.exports = { MCQOptionParser };
