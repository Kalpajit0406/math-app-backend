/**
 * PageClassificationEngine
 *
 * PURPOSE:
 *   Determine the structural nature of a page or text block BEFORE parsing.
 *   This is the document-understanding layer that prevents cross-contamination
 *   between MCQ, Fill-in-Blank, Column-Matching, and Answer-Key content.
 *
 * OUTPUT PAGE TYPES:
 *   MCQ_PAGE           – Contains numbered questions with (A)(B)(C)(D) options
 *   FILL_BLANK_PAGE    – Contains blank-fill or completion-type questions
 *   COLUMN_MATCH_PAGE  – Contains column A / column B table layout
 *   ANSWER_KEY_PAGE    – Dense answer grid, no full question text
 *   MIXED_PAGE         – Combination of types
 *   UNKNOWN_PAGE       – Could not classify
 *
 * SECTION TYPES (within a page):
 *   MCQ | FILL | TABLE | ANSWER_KEY | DESCRIPTIVE | UNKNOWN
 */

'use strict';

// ─── PAGE TYPE CONSTANTS ──────────────────────────────────────────────────────
const PAGE_TYPES = {
  MCQ_PAGE:          'MCQ_PAGE',
  FILL_BLANK_PAGE:   'FILL_BLANK_PAGE',
  COLUMN_MATCH_PAGE: 'COLUMN_MATCH_PAGE',
  ANSWER_KEY_PAGE:   'ANSWER_KEY_PAGE',
  THEORY_PAGE:       'THEORY_PAGE',
  MIXED_PAGE:        'MIXED_PAGE',
  UNKNOWN_PAGE:      'UNKNOWN_PAGE',
};

// ─── PARSER TYPE CONSTANTS ────────────────────────────────────────────────────
const PARSER_TYPES = {
  MCQ:         'MCQ',
  FILL:        'FILL',
  TABLE:       'TABLE',
  ANSWER_KEY:  'ANSWER_KEY',
  THEORY:      'THEORY',
  DESCRIPTIVE: 'DESCRIPTIVE',
  UNKNOWN:     'UNKNOWN',
};

// ─── SECTION HEADER PATTERNS ──────────────────────────────────────────────────
// Maps normalized section title patterns to parser routing types.
const SECTION_ROUTING_MAP = [
  // TABLE / COLUMN MATCHING
  {
    patterns: [
      /column\s*match/i,
      /match\s*the\s*column/i,
      /স্তম্ভ\s*মেলাও/i,
      /স্তম্ভ-i/i,
      /स्तंभ/i,
      /list\s*[–\-]\s*i/i,
      /tabular\s*type/i,
    ],
    parserType: PARSER_TYPES.TABLE,
  },
  // FILL IN THE BLANK
  {
    patterns: [
      /fill\s*in\s*the\s*blank/i,
      /শূন্যস্থান/i,
      /रिक्त\s*स्थान/i,
      /complete\s*the\s*following/i,
      /blank\s*type/i,
    ],
    parserType: PARSER_TYPES.FILL,
  },
  // ANSWER KEY
  {
    patterns: [
      /^answers?\s*(?:key|section)?\s*$/i,
      /উত্তরমালা/i,
      /সংক্ষিপ্ত\s*উত্তরমালা/i,
      /correct\s*option/i,
      /key\s*answer/i,
    ],
    parserType: PARSER_TYPES.ANSWER_KEY,
  },
  // THEORY
  {
    patterns: [
      /theory/i,
      /notes/i,
      /summary/i,
      /concepts?/i,
      /key\s*points/i,
      /introduction/i,
    ],
    parserType: PARSER_TYPES.THEORY,
  },
  // MCQ
  {
    patterns: [
      /multiple\s*choice/i,
      /mcq/i,
      /objective\s*type/i,
      /বহু\s*নির্বাচনী/i,
    ],
    parserType: PARSER_TYPES.MCQ,
  },
];

// ─── ANSWER KEY DETECTION SIGNALS ────────────────────────────────────────────
// Line pattern that matches a compact answer: "5. (B)" or "12. C" or "3. খ"
const SINGLE_ANSWER_LINE = /^\d{1,3}\s*[.):\s]\s*\(?[A-Da-dকখগঘ১২৩৪i-ivI-IV]\)?\s*$/;
// Row with multiple inline answers: "1. A  2. B  3. C"
const MULTI_ANSWER_LINE  = /(?:\d{1,3}\s*[.):\s]\s*\(?[A-Da-dকখগঘ১২৩৪i-ivI-IV]\)?\s*){2,}/;

// ─── TABLE / COLUMN MATCHING SIGNALS ─────────────────────────────────────────
const TABLE_SIGNALS = [
  /\\begin\{(?:tabular|matrix|pmatrix|bmatrix|array)\}/i,
  /column\s*[AB]/i,
  /স্তম্ভ\s*[AB]/i,
  // Column-matching notation: [i]-[a], (i)-(a) — both sides MUST be letter/roman, not digits
  /\[[a-divx]+\]\s*[-–]\s*\[[a-d]+\]/i,
  /\([ivx]{1,4}\)\s*[-–]\s*\([a-d]\)/i,
];

// ─── FILL-IN-BLANK SIGNALS ────────────────────────────────────────────────────
const FILL_SIGNALS = [
  /_{4,}/,
  /\.{4,}/,
  /\. \. \./,
  /fill\s*in/i,
  /শূন্যস্থান/i,
  /रिक्त/i,
];

// ─── MCQ OPTION SIGNALS ───────────────────────────────────────────────────────
// At least one line that looks like a standalone MCQ option
const MCQ_OPTION_LINE = /^\s*[\(\[]?\s*[ABCDabcdকখগঘ১২৩৪]\s*[\)\]\.\:]\s*.{2,}/;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Count how many non-empty lines match a predicate.
 */
function countLines(lines, predicate) {
  return lines.filter(l => l.trim().length > 0 && predicate(l.trim())).length;
}

/**
 * Safely test an array of regex patterns against a string.
 */
function matchesAny(str, patterns) {
  return patterns.some(p => p.test(str));
}

// ─── MAIN CLASS ───────────────────────────────────────────────────────────────

class PageClassificationEngine {

  /**
   * Classify an entire page of OCR text.
   *
   * @param {string} text  - Raw or normalised page text
   * @returns {PageClassification}
   */
  static classifyPage(text) {
    if (!text || !text.trim()) {
      return this._buildResult(PAGE_TYPES.UNKNOWN_PAGE, PARSER_TYPES.UNKNOWN, 0, {
        reason: 'empty text',
      });
    }

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const total = lines.length;

    // ── Signal counts ─────────────────────────────────────────────────────────
    const answerKeyLines   = countLines(lines, l => SINGLE_ANSWER_LINE.test(l) || MULTI_ANSWER_LINE.test(l));
    const mcqOptionLines   = countLines(lines, l => MCQ_OPTION_LINE.test(l));
    const tableSignalLines = countLines(lines, l => matchesAny(l, TABLE_SIGNALS));
    const fillSignalLines  = countLines(lines, l => matchesAny(l, FILL_SIGNALS));

    // ── Explicit heading keywords ─────────────────────────────────────────────
    const hasExplicitAnswerHeading = /(?:answer\s*key|answers|answer\s*sheet|উত্তরমালা|উত্তর|সংক্ষিপ্ত\s*উত্তরমালা|conventional\s*type\s*answers?|correct\s*options?|key\s*answers?)/i.test(text);
    const hasTableHeading          = matchesAny(text, [/column\s*(a|b)/i, /স্তম্ভ/i, /match\s*the\s*column/i]);
    const hasFillHeading           = matchesAny(text, [/fill\s*in\s*the\s*blank/i, /শূন্যস্থান/i, /रिक्त\s*स्थान/i]);

    // ── Ratios ────────────────────────────────────────────────────────────────
    const answerKeyRatio = total > 0 ? answerKeyLines / total : 0;

    // ── Classification logic (priority order) ─────────────────────────────────

    // 1. Answer Key Page – strict
    if (hasExplicitAnswerHeading || answerKeyRatio > 0.20 || answerKeyLines >= 4) {
      return this._buildResult(PAGE_TYPES.ANSWER_KEY_PAGE, PARSER_TYPES.ANSWER_KEY, 0.95, {
        answerKeyLines,
        answerKeyRatio: answerKeyRatio.toFixed(2),
        hasExplicitAnswerHeading,
      });
    }

    // 1.5. Theory Page Detection
    const hasTheoryHeading = matchesAny(text, [/theory/i, /concepts?/i, /key\s*points/i, /introduction/i]);
    const avgLineLength = lines.length > 0 ? lines.reduce((acc, l) => acc + l.length, 0) / lines.length : 0;
    const questionHeaderLines = countLines(lines, l => /^(?:Question|Q|No|প্রশ্ন|প্র)\s*[:\-]?\s*(\d+)/i.test(l) || /^\d+[\.\)]\s+/.test(l));
    if (hasTheoryHeading || (avgLineLength > 65 && mcqOptionLines === 0 && answerKeyLines === 0 && questionHeaderLines < 2)) {
      return this._buildResult(PAGE_TYPES.THEORY_PAGE, PARSER_TYPES.THEORY, 0.92, {
        avgLineLength,
        questionHeaderLines,
        hasTheoryHeading,
      });
    }

    // 2. Column Matching / Table
    if (hasTableHeading || tableSignalLines >= 2) {
      return this._buildResult(PAGE_TYPES.COLUMN_MATCH_PAGE, PARSER_TYPES.TABLE, 0.90, {
        tableSignalLines,
        hasTableHeading,
      });
    }

    // 3. Fill In The Blank
    if (hasFillHeading || fillSignalLines >= 2) {
      return this._buildResult(PAGE_TYPES.FILL_BLANK_PAGE, PARSER_TYPES.FILL, 0.88, {
        fillSignalLines,
        hasFillHeading,
      });
    }

    // 4. MCQ
    if (mcqOptionLines >= 4) {
      return this._buildResult(PAGE_TYPES.MCQ_PAGE, PARSER_TYPES.MCQ, 0.85, {
        mcqOptionLines,
      });
    }

    // 5. Mixed or Unknown
    const signals = [
      mcqOptionLines > 0,
      fillSignalLines > 0,
      tableSignalLines > 0,
    ].filter(Boolean).length;

    if (signals >= 2) {
      return this._buildResult(PAGE_TYPES.MIXED_PAGE, PARSER_TYPES.MCQ, 0.60, {
        mcqOptionLines,
        fillSignalLines,
        tableSignalLines,
        reason: 'mixed signals – defaulting to MCQ router',
      });
    }

    return this._buildResult(PAGE_TYPES.UNKNOWN_PAGE, PARSER_TYPES.MCQ, 0.40, {
      reason: 'insufficient signals to classify',
    });
  }

  /**
   * Classify a single section heading line into a parser routing type.
   *
   * @param {string} heading - A trimmed section title line
   * @returns {{ parserType: string, confidence: number }}
   */
  static classifySectionHeading(heading) {
    if (!heading) return { parserType: PARSER_TYPES.UNKNOWN, confidence: 0 };
    for (const entry of SECTION_ROUTING_MAP) {
      if (matchesAny(heading, entry.patterns)) {
        return { parserType: entry.parserType, confidence: 0.95 };
      }
    }
    return { parserType: PARSER_TYPES.UNKNOWN, confidence: 0 };
  }

  /**
   * Determine the appropriate parser type for a single text block (segment).
   * Used after segmentation to over-ride the section-level default when
   * block-level signals are conclusive.
   *
   * @param {string} blockText
   * @param {string} sectionDefault - Parser type inherited from the section
   * @returns {{ parserType: string, confidence: number, signals: object }}
   */
  static classifyBlock(blockText, sectionDefault = PARSER_TYPES.MCQ) {
    if (!blockText) return { parserType: sectionDefault, confidence: 0.5, signals: {} };

    const isTable = matchesAny(blockText, TABLE_SIGNALS) ||
                    (blockText.match(/\|/g) || []).length >= 4;
    const isFill  = matchesAny(blockText, FILL_SIGNALS);

    if (isTable) {
      return { parserType: PARSER_TYPES.TABLE, confidence: 0.92, signals: { isTable } };
    }
    if (isFill && sectionDefault !== PARSER_TYPES.MCQ) {
      // Only promote to FILL if we're not in a confirmed MCQ section
      return { parserType: PARSER_TYPES.FILL, confidence: 0.80, signals: { isFill } };
    }
    if (isFill && sectionDefault === PARSER_TYPES.MCQ) {
      // Within an MCQ section, a blank placeholder might be part of the question
      return { parserType: PARSER_TYPES.MCQ, confidence: 0.65, signals: { isFill, overridden: true } };
    }

    return { parserType: sectionDefault, confidence: 0.70, signals: {} };
  }

  /**
   * Extract an ordered list of section transitions from a document.
   * Returns an array of section descriptors sorted by their position in text.
   *
   * @param {string} text
   * @returns {SectionDescriptor[]}
   */
  static extractSections(text) {
    if (!text) return [{ title: 'Default', startIndex: 0, parserType: PARSER_TYPES.MCQ, confidence: 0.5 }];

    const lines = text.split('\n');
    const sections = [{
      title: 'Default',
      startIndex: 0,
      parserType: PARSER_TYPES.MCQ,
      confidence: 0.5,
    }];

    let charIndex = 0;
    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed) {
        const isSectionTitle = this._isSectionTitle(trimmed);
        if (isSectionTitle) {
          const { parserType, confidence } = this.classifySectionHeading(trimmed);
          sections.push({
            title: trimmed,
            startIndex: charIndex,
            parserType: parserType !== PARSER_TYPES.UNKNOWN ? parserType : PARSER_TYPES.MCQ,
            confidence,
          });
        }
      }

      charIndex += line.length + 1;
    }

    return sections;
  }

  /**
   * Given an array of section descriptors and a character offset,
   * return the active section at that offset.
   *
   * @param {SectionDescriptor[]} sections
   * @param {number} charOffset
   * @returns {SectionDescriptor}
   */
  static getActiveSectionAt(sections, charOffset) {
    let active = sections[0];
    for (const section of sections) {
      if (section.startIndex <= charOffset) {
        active = section;
      }
    }
    return active;
  }

  // ─── PRIVATE HELPERS ────────────────────────────────────────────────────────

  static _isSectionTitle(trimmed) {
    // LaTeX section commands
    if (/^\\(?:chapter|section|subsection|subsubsection)\*?\{.*\}\s*$/i.test(trimmed)) return true;
    // Common English exercise markers
    if (/^(?:exercise|ex\.?)\s*\d*(?:\.\d+)*\s*$/i.test(trimmed)) return true;
    if (/^(?:chapter|ch\.?)\s*\d+\s*$/i.test(trimmed)) return true;
    // Named section types
    if (/^(?:Conventional\s*Type|Multiple\s*Choice\s*Questions|Fill\s*in\s*the\s*Blank|Column\s*Matching|Analytical\s*Type|Short\s*Answer\s*Type|Long\s*Answer\s*Type|উত্তরমালা|উত্তর|Answers?(?:\s*Key)?)\s*$/i.test(trimmed)) return true;
    // Detect SECTION_TITLE from ContentClassificationEngine routing
    if (matchesAny(trimmed, SECTION_ROUTING_MAP.flatMap(e => e.patterns))) return true;
    return false;
  }

  static _buildResult(pageType, defaultParserType, confidence, diagnostics = {}) {
    return {
      pageType,
      defaultParserType,
      confidence,
      diagnostics,
    };
  }
}

module.exports = {
  PageClassificationEngine,
  PAGE_TYPES,
  PARSER_TYPES,
};
