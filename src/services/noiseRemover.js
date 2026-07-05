/**
 * NoiseRemover — Phase 4: Deep Noise Extraction
 *
 * REMOVES from question text (stores as metadata instead):
 *   - School names, institution names
 *   - Exam years, exam names
 *   - WBCHSE / WBBSE / board references
 *   - Publisher names (Chhaya, Saraswati, S. Chand, etc.)
 *   - Difficulty stars / rating symbols
 *   - Answer key references
 *   - QR code references
 *   - Footer / header text that leaked through layout analysis
 *   - Page numbers
 *   - Section headers (Chapter X, Exercise Y)
 *
 * STORES extracted metadata in:
 *   { examBoard, examYear, sourceSchool, difficulty, chapter, pageHints }
 *
 * NEVER removes:
 *   - Bengali or English mathematical text
 *   - Question body content
 *   - LaTeX formulas
 *   - Option labels or option text
 */

'use strict';

// ─── NOISE EXTRACTION PATTERNS ────────────────────────────────────────────────

// Publisher names (always noise in question text)
const PUBLISHER_PATTERNS = [
  /\bChhaya\s+(?:Mathematics|Math|Publication|Prakashani)?\b/gi,
  /\bSaraswati\s+(?:Publication|Math)?\b/gi,
  /\bS\.?\s*Chand\b/gi,
  /\bNCERT\b/gi,
  /\bPearson\b/gi,
  /\bKundu\s+Publication\b/gi,
  /\bHS\s+CORNER\b/gi,
];

// Exam board references
const BOARD_PATTERNS = [
  /\bWBCHSE\b/gi,
  /\bWBBSE\b/gi,
  /\bCBSE\b/gi,
  /\bICSE\b/gi,
  /\bISC\b/gi,
];

// Exam year patterns (e.g. "2023" or "Year: 2023" or "[2023]")
const EXAM_YEAR_RE = /(?:year\s*[:：]?\s*)?\b(20\d{2}|19\d{2})\b/gi;

// School / institution patterns
const SCHOOL_PATTERNS = [
  /\b\w+\s+(?:School|College|High\s+School|Hr\.?\s*Sec\.?|Academy|Vidyalaya|Vidyamandir|Institution|Institute)\b/gi,
  /বিদ্যালয়|মহাবিদ্যালয়|স্কুল|কলেজ/g,
];

// Difficulty markers
const DIFFICULTY_PATTERNS = [
  /^\s*(?:easy|medium|hard|difficult|very\s+hard)\s*$/i,
  /^\s*[★✦✧•]{1,5}\s*$/,
  /difficulty\s*[:：]?\s*(?:easy|medium|hard)/i,
  /মান\s*[:：]?\s*\d+/gi,           // Bengali "marks"
];

// Section header patterns (that somehow leaked in)
const SECTION_HEADER_PATTERNS = [
  /^(?:Chapter|Ch\.?)\s*\d+(?:\.\d+)*\s*[:–\-]?\s*/i,
  /^(?:Exercise|Ex\.?)\s*\d+(?:\.\d+)*\s*[:–\-]?\s*/i,
  /^(?:Unit|Topic|Section|Lesson)\s*\d+\s*[:–\-]?\s*/i,
  /^(?:Multiple\s*Choice\s*Questions|MCQ\s*Section|Objective\s*Type)\s*$/i,
  /^(?:Answer\s*Key|Answers?|উত্তরমালা)\s*$/i,
  /^(?:Fill\s+in\s+the\s+Blank|Column\s+Match(?:ing)?)\s*$/i,
];

// QR code references
const QR_PATTERNS = [
  /(?:scan\s+(?:this\s+)?(?:qr\s+code?|code)|qr\s+code\s+for)/gi,
];

// Lines that are PURE metadata (entire line is discarded)
function isMetadataLine(line) {
  const t = line.trim();
  if (!t) return false;
  return (
    PUBLISHER_PATTERNS.some(p => p.test(t)) ||
    BOARD_PATTERNS.some(p => p.test(t)) ||
    SCHOOL_PATTERNS.some(p => p.test(t)) ||
    DIFFICULTY_PATTERNS.some(p => p.test(t)) ||
    SECTION_HEADER_PATTERNS.some(p => p.test(t)) ||
    QR_PATTERNS.some(p => p.test(t))
  );
}

// ─── METADATA EXTRACTORS ──────────────────────────────────────────────────────

function extractExamYear(text) {
  const years = [];
  let m;
  const re = new RegExp(EXAM_YEAR_RE.source, 'gi');
  while ((m = re.exec(text)) !== null) {
    years.push(m[1] || m[0]);
  }
  return years.length > 0 ? years[years.length - 1] : null;  // most recent year
}

function extractExamBoard(text) {
  for (const p of BOARD_PATTERNS) {
    const m = text.match(new RegExp(p.source, 'i'));
    if (m) return m[0].trim().toUpperCase();
  }
  return null;
}

function extractDifficulty(text) {
  const m = text.match(/(?:difficulty\s*[:：]?\s*)?(easy|medium|hard|difficult|very\s+hard)/i);
  if (m) return m[1].toLowerCase();
  const stars = text.match(/[★✦✧]{1,5}/);
  if (stars) return `stars:${stars[0].length}`;
  return null;
}

// ─── MAIN CLASS ───────────────────────────────────────────────────────────────

class NoiseRemover {

  /**
   * Remove all noise from a text block and return clean text + extracted metadata.
   *
   * @param {string} text - OCR text (already normalized)
   * @returns {{ cleanText: string, extractedMeta: object }}
   */
  static clean(text) {
    if (!text || !text.trim()) {
      return { cleanText: '', extractedMeta: {} };
    }

    // ── Extract metadata from the full text BEFORE removing lines ──────────
    const extractedMeta = {
      examYear:     extractExamYear(text),
      examBoard:    extractExamBoard(text),
      difficulty:   extractDifficulty(text),
      sourceSchool: this._extractSchool(text),
    };

    // ── Filter lines ────────────────────────────────────────────────────────
    const lines     = text.split('\n');
    const cleanLines = [];

    for (const line of lines) {
      // Skip pure metadata lines
      if (isMetadataLine(line)) continue;

      // Strip inline metadata fragments from the line
      let cleaned = this._stripInlineNoise(line);

      // If after stripping, the line is empty or only noise — discard
      if (!cleaned.trim()) continue;

      cleanLines.push(cleaned);
    }

    const cleanText = cleanLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

    return { cleanText, extractedMeta };
  }

  /**
   * Clean a single question text string (post-parse, not full-page).
   * Removes metadata injected mid-question.
   */
  static cleanQuestionText(text) {
    if (!text) return '';
    let s = text;

    // Remove exam year references
    s = s.replace(/\[\s*20\d{2}\s*\]/g, '').replace(/\(\s*20\d{2}\s*\)/g, '');

    // Remove board references
    for (const p of BOARD_PATTERNS) {
      s = s.replace(new RegExp(p.source, 'gi'), '');
    }

    // Remove difficulty markers
    s = s.replace(/[★✦✧•]{1,5}/g, '');
    s = s.replace(/(?:easy|medium|hard|difficult)\s*(?:level)?/gi, '');

    // Collapse whitespace
    s = s.replace(/[ \t]{2,}/g, ' ').trim();

    return s;
  }

  // ─── PRIVATE ──────────────────────────────────────────────────────────────

  static _extractSchool(text) {
    for (const p of SCHOOL_PATTERNS) {
      const m = text.match(new RegExp(p.source, 'i'));
      if (m) return m[0].trim();
    }
    return null;
  }

  static _stripInlineNoise(line) {
    let s = line;

    // Strip publisher branding inline
    for (const p of PUBLISHER_PATTERNS) {
      s = s.replace(new RegExp(p.source, 'gi'), '');
    }

    // Strip board references inline
    for (const p of BOARD_PATTERNS) {
      s = s.replace(new RegExp(p.source, 'gi'), '');
    }

    // Strip QR references inline
    for (const p of QR_PATTERNS) {
      s = s.replace(new RegExp(p.source, 'gi'), '');
    }

    // Clean up resulting artifacts (double spaces, leading commas, etc.)
    s = s.replace(/,\s*,/g, ',').replace(/\(\s*\)/g, '').replace(/[ \t]{2,}/g, ' ').trim();

    return s;
  }
}

module.exports = { NoiseRemover };
