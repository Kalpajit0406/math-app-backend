/**
 * MCQOptionParser — Phase 5: Option Extraction
 *
 * HANDLES:
 *   - Standard:         (A) (B) (C) (D)  — inline or line-separated
 *   - Dotted:           A. B. C. D.
 *   - Bracketed:        [A] [B] [C] [D]
 *   - Bengali alpha:    ক. খ. গ. ঘ.  /  (ক) (খ) (গ) (ঘ)
 *   - Bengali numeric:  ১. ২. ৩. ৪.  /  (১) (২) (৩) (৪)
 *   - Roman numerals:   (i) (ii) (iii) (iv)
 *   - Mixed-script:     Any of the above in the SAME question
 *   - OCR spacing:      ( A )  [  B  ]  A .  (spaced variants)
 *
 * GUARANTEES:
 *   - Exactly FOUR labelled slots (A B C D) — empty string if not found
 *   - Duplicate option detection
 *   - No option bleed between questions (truncates at next question header)
 *   - Math content inside options is preserved
 *   - No fabricated options — missing → empty string
 *
 * VALIDATION:
 *   - filledCount: number of options with actual content
 *   - hasDuplicates: true if any two options share identical text
 *   - isComplete: true only if all 4 options have content
 */

'use strict';

// ─── LABEL → INDEX MAP ───────────────────────────────────────────────────────
const LABEL_TO_IDX = {
  // Latin uppercase/lowercase
  'A': 0, 'B': 1, 'C': 2, 'D': 3,
  'a': 0, 'b': 1, 'c': 2, 'd': 3,
  // Bengali alphabetic
  'ক': 0, 'খ': 1, 'গ': 2, 'ঘ': 3,
  // Bengali numeric
  '১': 0, '২': 1, '৩': 2, '৪': 3,
  // ASCII numeric
  '1': 0, '2': 1, '3': 2, '4': 3,
  // Roman
  'i': 0, 'ii': 1, 'iii': 2, 'iv': 3,
  'I': 0, 'II': 1, 'III': 2, 'IV': 3,
};

const CANONICAL = ['A', 'B', 'C', 'D'];

function canonicalize(raw) {
  if (!raw) return null;
  return LABEL_TO_IDX[raw] !== undefined ? CANONICAL[LABEL_TO_IDX[raw]] : null;
}

// ─── ANSWER BADGE STRIP PATTERN ───────────────────────────────────────────────
// Strip inline answer badges from option text (Ans: / উত্তর: / Correct:)
// The letter after "Ans:" may or may not be captured — both forms handled
const ANSWER_BADGE_SUFFIX = /\s*(?:Ans(?:wer)?\.?|উত্তর[ঃ:]?|Correct\s*(?:option|answer)?\.?)\s*[:：]?\s*(?:[\(\[]?[A-Da-dকখগঘ১-৪i-ivI-IV]{1,3}[\)\]]?)?\s*$/i;

// ─── OPTION START PATTERN ─────────────────────────────────────────────────────
// Matches option labels at the beginning of a string, handling OCR spacing.
// Captures the label in group 1 or 2.
const OPT_START = /^[\(\[]?\s*(A|B|C|D|a|b|c|d|ক|খ|গ|ঘ|১|২|৩|৪|i{1,3}|iv|I{1,3}|IV)\s*[\)\]\.:\-]\s*|^[\(\[]?\s*([1-4])\s*[\)\]\.:\-]\s*(?![A-Z\u0980-\u09FF][a-zA-Z\u0980-\u09FF]{3,})/;

// ─── INLINE PAREN PATTERN ─────────────────────────────────────────────────────
// Matches "(A) option text (B) option text ..." on a single line
const INLINE_PAREN = /(?<![A-Za-z0-9\\])[\(\[]\s*(A|B|C|D|a|b|c|d|ক|খ|গ|ঘ|১|২|৩|৪|i{1,3}|iv|I{1,3}|IV)\s*[\)\]]\s*([\s\S]*?)(?=\s*(?<![A-Za-z0-9\\])[\(\[]\s*(?:A|B|C|D|a|b|c|d|ক|খ|গ|ঘ|১|২|৩|৪|i{1,3}|iv|I{1,3}|IV)\s*[\)\]]|$)/g;

// Question header pattern (to detect bleed-in of next question)
const NEXT_Q_HEADER = /\n\s*(?:Question|Q\.?\s*|প্রশ্ন\s*|No\.?\s*)\d{1,3}[\s\.):\-]|\n\s*\d{1,3}[\.):\-]\s+[A-Z\u0980-\u09FF]/;

// ─── MATH RANGE FINDER ───────────────────────────────────────────────────────
function getMathRanges(text) {
  const ranges = [];
  const re = /\$\$[\s\S]*?\$\$|\$[^$\n]*?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/gs;
  let m;
  while ((m = re.exec(text)) !== null) {
    ranges.push({ start: m.index, end: m.index + m[0].length });
  }
  return ranges;
}

function insideMath(idx, ranges) {
  return ranges.some(r => idx >= r.start && idx < r.end);
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function hasContent(text) {
  if (!text) return false;
  const t = text.trim();
  return t.length >= 1 && /[a-zA-Z0-9\u0080-\uFFFF$\\+\-=]/.test(t);
}

function buildOptions(optMap) {
  return CANONICAL.map(label => ({
    label,
    text: ((optMap[label] || '').trim()).replace(ANSWER_BADGE_SUFFIX, '').trim(),
  }));
}

function countFilled(opts) {
  return opts.filter(o => hasContent(o.text)).length;
}

function hasDuplicates(opts) {
  const filled = opts.filter(o => hasContent(o.text)).map(o => o.text.trim().toLowerCase());
  return new Set(filled).size < filled.length;
}

// ─── QUESTION PREAMBLE EXTRACTOR ─────────────────────────────────────────────

function extractPreamble(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const preamble = [];
  for (const line of lines) {
    if (OPT_START.test(line)) break;
    preamble.push(line);
  }
  // Remove leading question number from preamble
  const raw = preamble.join(' ').replace(/^\d{1,3}[\.):\-]\s+/, '').trim();
  return raw || null;
}

// ─── PARSER 1: INLINE PARENTHESIS FORMAT ─────────────────────────────────────

function parseInlineParen(text) {
  const mathRanges = getMathRanges(text);
  const optMap = {};
  let firstIdx = -1;

  INLINE_PAREN.lastIndex = 0;
  const pattern = new RegExp(INLINE_PAREN.source, 'g');
  let m;

  while ((m = pattern.exec(text)) !== null) {
    if (insideMath(m.index, mathRanges)) continue;
    const canonical = canonicalize(m[1]);
    if (!canonical) continue;
    const optText = (m[2] || '').trim()
      .replace(ANSWER_BADGE_SUFFIX, '')  // strip trailing Ans: badge
      .replace(/\s+/g, ' ')
      .trim();
    if (!optMap[canonical] && hasContent(optText)) {
      optMap[canonical] = optText;
      if (firstIdx === -1) firstIdx = m.index;
    }
  }

  if (Object.keys(optMap).length < 2) return null;

  const questionText = firstIdx > 0
    ? text.slice(0, firstIdx).replace(/^\d{1,3}[\.):\-]\s*/, '').trim()
    : '';

  const options = buildOptions(optMap);
  return { question: questionText, options, format: 'inline-paren' };
}

// ─── PARSER 2: LINE-BASED FORMAT ─────────────────────────────────────────────

function parseLineBased(text) {
  const lines = text.split('\n').map(l => l.trimEnd()).filter(l => l.trim());
  const optMap  = {};
  const qLines  = [];
  let curLabel  = null;
  let firstOptIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const m = trimmed.match(OPT_START);

    // Only treat as option start if it's NOT a question header like "3. What is..."
    const isQHeader = /^\d{1,3}[\.):\-]\s+[A-Z\u0980-\u09FF].{5,}/.test(trimmed);

    if (m && !isQHeader) {
      const rawLabel = m[1] || m[2];
      const canonical = canonicalize(rawLabel);
      if (!canonical) {
        // Unknown label — treat as continuation
        if (curLabel !== null) optMap[curLabel] += ' ' + trimmed;
        continue;
      }

      curLabel = canonical;
      const rest = trimmed.slice(m[0].length).trim();
      optMap[curLabel] = rest;
      if (firstOptIdx === -1) firstOptIdx = i;
    } else if (curLabel !== null) {
      // Continuation of current option
      // Stop if it looks like a new question
      if (/^\d{1,3}[\.):\-]\s+[A-Z\u0980-\u09FF]/.test(trimmed)) break;
      optMap[curLabel] += ' ' + trimmed;
    } else {
      qLines.push(line);
    }
  }

  if (Object.keys(optMap).length < 2) return null;

  const questionText = qLines
    .join('\n')
    .replace(/^\d{1,3}[\.):\-]\s*/, '')
    .trim();

  // Trim trailing whitespace and answer badges from options
  for (const k of Object.keys(optMap)) {
    optMap[k] = optMap[k].trim().replace(ANSWER_BADGE_SUFFIX, '').trim();
  }

  const options = buildOptions(optMap);
  return { question: questionText, options, format: 'line-based' };
}

// ─── PARSER 3: STRUCTURED KEY-VALUE FORMAT ───────────────────────────────────

function parseStructured(text) {
  const patterns = [
    /question\s*[:\-]?\s*(.+?)\s*(?:options?|choices?)\s*[:\-]?\s*(.*)/is,
    /(\d+\.\s+.+?)\s*option\s*a\s*[:\-]?\s*(.+?)(?=option|choice|$)/is,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const qText   = match[1].trim();
    const optPart = match[2].trim();
    const optMap  = {};

    for (const line of optPart.split('\n').filter(l => l.trim())) {
      const om = line.match(/^[\(\[]?\s*([A-Da-dক-ঘ১-৪i-ivI-IV]{1,3})\s*[\)\]\.:]+\s*(.+)$/);
      if (om) {
        const canonical = canonicalize(om[1]);
        if (canonical && !optMap[canonical]) optMap[canonical] = om[2].trim();
      }
    }

    if (Object.keys(optMap).length < 2) continue;
    return { question: qText, options: buildOptions(optMap), format: 'structured' };
  }

  return null;
}

// ─── MAIN CLASS ───────────────────────────────────────────────────────────────

class MCQOptionParser {

  /**
   * Parse MCQ options from an isolated question segment.
   *
   * @param {string} segmentText
   * @returns {ParsedMCQ | null}
   *   {
   *     question: string,
   *     options: [{label, text}] × 4,
   *     format: string,
   *     filledCount: number,
   *     isComplete: boolean,
   *     hasDuplicates: boolean,
   *   }
   */
  static parse(segmentText) {
    if (!segmentText || typeof segmentText !== 'string') return null;

    // Truncate if a next question header leaked in
    let text = segmentText.trim();
    const bleedMatch = text.match(NEXT_Q_HEADER);
    if (bleedMatch && bleedMatch.index > 10) {
      text = text.slice(0, bleedMatch.index).trim();
    }

    // Try parsers in priority order
    const result = parseInlineParen(text)
                || parseLineBased(text)
                || parseStructured(text);

    if (!result) return null;

    // Recover placeholder question text if parser returned empty
    if (!result.question || /^(?:Question\s*(?:Text)?|Q\.?No\.?)$/i.test(result.question.trim())) {
      const recovered = extractPreamble(text);
      if (recovered) result.question = recovered;
    }

    // Require at least 2 filled options
    const filled = countFilled(result.options);
    if (filled < 2) return null;

    return {
      question:      result.question || '',
      options:       result.options,
      format:        result.format,
      filledCount:   filled,
      isComplete:    filled === 4,
      hasDuplicates: hasDuplicates(result.options),
    };
  }

  /**
   * Validate that options are well-formed.
   * Returns list of validation errors (empty array = valid).
   */
  static validateOptions(options) {
    const errors = [];
    if (!Array.isArray(options) || options.length !== 4) {
      errors.push('Expected exactly 4 options');
      return errors;
    }

    const labels = options.map(o => o.label);
    const expectedLabels = ['A', 'B', 'C', 'D'];
    for (const expected of expectedLabels) {
      if (!labels.includes(expected)) {
        errors.push(`Missing option ${expected}`);
      }
    }

    const texts = options.filter(o => hasContent(o.text)).map(o => o.text.trim().toLowerCase());
    if (new Set(texts).size < texts.length) {
      errors.push('Duplicate option texts detected');
    }

    return errors;
  }
}

module.exports = { MCQOptionParser };
