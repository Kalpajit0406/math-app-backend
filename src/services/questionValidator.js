/**
 * QuestionValidator — Enhanced Structural Validator
 *
 * PURPOSE:
 *   Gate-keeper before queue insertion.
 *   Reject parser garbage before it ever reaches the student UI.
 *
 * VALIDATES:
 *   - Minimum semantic content (length, no placeholders)
 *   - Format-specific structural rules (MCQ, fill, table)
 *   - Option integrity (no parser artifacts, no isolated symbols)
 *   - No answer-key-only text leaked through
 *   - No malformed arrays
 *   - Confidence thresholds
 */

'use strict';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const MIN_QUESTION_LENGTH = 5;   // characters
const MIN_OPTION_LENGTH   = 1;   // characters (options can be short: numbers/symbols)
const MCQ_MIN_OPTIONS     = 2;   // at least 2 filled options for a valid MCQ

// ─── PLACEHOLDER STRINGS ─────────────────────────────────────────────────────
// These are sentinel values that indicate a parser failure, NOT real content.
const PLACEHOLDER_PATTERNS = [
  /^question\s*text$/i,
  /^q\.no\.$/i,
  /^question$/i,
  /^no\.$/i,
  /^option\s*[abcd]$/i,
  /^\.\.\.\s*$/,
  /^null$/i,
  /^undefined$/i,
  /^n\/a$/i,
];

// ─── ANSWER KEY LEAK PATTERNS ─────────────────────────────────────────────────
// Single-char or single-option answer strings that escaped the answer-page filter.
const ANSWER_LEAK_PATTERNS = [
  /^\s*\(?[a-dA-Dকখগঘ১২৩৪i-ivI-IV]\)?\s*$/,       // (A) or A alone
  /^\d{1,3}\s*[.):\s]\s*\(?[a-dA-D]\)?\s*$/,        // 5. (B)
];

// ─── SECTION HEADER LEAK PATTERNS ────────────────────────────────────────────
const SECTION_HEADER_PATTERNS = [
  /^(?:EXERCISE|Conventional\s*Type|HS\s*CORNER|Multiple\s*Choice\s*Questions|Fill\s*in\s*the\s*Blank|Column\s*Matching|Analytical\s*Type|Short\s*Answer\s*Type|Long\s*Answer\s*Type|উত্তরমালা|উত্তর|Answers?\s*Key)\s*$/i,
];

// ─── PARSER ARTIFACT PATTERNS ─────────────────────────────────────────────────
// Strings that come from broken LaTeX/parser artefacts, not real math.
const ARTIFACT_PATTERNS = [
  /^[&\s]+$/,            // only ampersands / whitespace → LaTeX column separator leak
  /^\\(?:hline|cline)/,  // table rule commands leaked as text
  /^[|]+$/,              // only pipe chars
  /^\s*[{}]\s*$/,        // lone braces
];

// ─── MCQ OPTION VALIDATORS ───────────────────────────────────────────────────

/**
 * Check if an option text is a genuine option (not an artifact or placeholder).
 */
function isValidOptionText(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (t.length < MIN_OPTION_LENGTH) return false;
  if (PLACEHOLDER_PATTERNS.some(p => p.test(t))) return false;
  if (ARTIFACT_PATTERNS.some(p => p.test(t))) return false;
  return true;
}

// ─── MAIN CLASS ───────────────────────────────────────────────────────────────

class QuestionValidator {

  /**
   * Validate a fully-enriched question object before queue insertion.
   *
   * @param {object} questionItem
   * @returns {{ isValid: boolean, errors: string[], warnings: string[] }}
   */
  static validate(questionItem) {
    if (!questionItem) {
      return { isValid: false, errors: ['Question item is null or undefined'], warnings: [] };
    }

    const errors   = [];
    const warnings = [];

    const questionText = (questionItem.questionText || questionItem.question || '').trim();
    const format       = (questionItem.format || questionItem.type || '').toLowerCase();
    const options      = questionItem.options;
    const confidence   = questionItem.ocrConfidence ?? questionItem.confidence ?? 1.0;

    // ── 1. Question text presence ─────────────────────────────────────────
    if (!questionText) {
      errors.push('Question text cannot be blank.');
    } else {
      // ── 2. Minimum length ────────────────────────────────────────────────
      if (questionText.length < MIN_QUESTION_LENGTH) {
        errors.push(`Question text too short (${questionText.length} chars, min ${MIN_QUESTION_LENGTH}).`);
      }

      // ── 3. Placeholder check ─────────────────────────────────────────────
      if (PLACEHOLDER_PATTERNS.some(p => p.test(questionText))) {
        errors.push(`Question text is a parser placeholder: "${questionText}".`);
      }

      // ── 4. Answer key leak check ─────────────────────────────────────────
      if (ANSWER_LEAK_PATTERNS.some(p => p.test(questionText))) {
        errors.push(`Question text matches an answer-key pattern: "${questionText}".`);
      }

      // ── 5. Section header leak check ─────────────────────────────────────
      if (SECTION_HEADER_PATTERNS.some(p => p.test(questionText))) {
        errors.push(`Question text is a section header: "${questionText}".`);
      }

      // ── 6. Parser artifact check ─────────────────────────────────────────
      if (ARTIFACT_PATTERNS.some(p => p.test(questionText))) {
        errors.push(`Question text appears to be a parser artifact: "${questionText}".`);
      }
    }

    // ── 7. Format-specific validation ────────────────────────────────────
    const isMCQ         = !['fill_in_blank', 'column_matching', 'descriptive', 'fill', 'table'].includes(format);
    const isFill        = format === 'fill_in_blank' || format === 'fill';
    const isTable       = format === 'column_matching' || format === 'table';

    if (isMCQ) {
      this._validateMCQOptions(options, errors, warnings);
    } else if (isFill) {
      this._validateFillOptions(options, errors, warnings);
    } else if (isTable) {
      this._validateTableOptions(options, errors, warnings, questionItem);
    } else {
      // Descriptive / other: just verify options is a valid array or absent
      if (options !== null && options !== undefined && !Array.isArray(options)) {
        errors.push('Options must be a valid array or null for non-MCQ types.');
      }
    }

    // ── 8. Confidence warning ─────────────────────────────────────────────
    if (confidence < 0.5) {
      warnings.push(`Low OCR confidence (${(confidence * 100).toFixed(0)}%). Question may contain errors.`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ─── FORMAT VALIDATORS ────────────────────────────────────────────────────

  static _validateMCQOptions(options, errors, warnings) {
    if (!Array.isArray(options)) {
      errors.push('MCQ options must be an array.');
      return;
    }

    // Normalise: handle both string and {label, text} formats
    const optionTexts = options.map(opt =>
      typeof opt === 'object' && opt !== null ? (opt.text || '') : String(opt || '')
    );

    // Count genuinely filled options
    const filledOptions = optionTexts.filter(t => isValidOptionText(t));

    if (filledOptions.length < MCQ_MIN_OPTIONS) {
      errors.push(`MCQ requires at least ${MCQ_MIN_OPTIONS} valid option texts. Found: ${filledOptions.length}.`);
    }

    // Check for duplicates among filled options
    const unique = new Set(filledOptions.map(t => t.trim().toLowerCase()));
    if (unique.size < filledOptions.length) {
      warnings.push('Duplicate option texts detected.');
    }

    // Check each individual option for artifacts
    optionTexts.forEach((t, i) => {
      if (t && t.trim()) {
        const label = options[i]?.label || String.fromCharCode(65 + i);
        if (ARTIFACT_PATTERNS.some(p => p.test(t.trim()))) {
          errors.push(`Option ${label} contains a parser artifact: "${t.trim()}".`);
        }
        if (PLACEHOLDER_PATTERNS.some(p => p.test(t.trim()))) {
          errors.push(`Option ${label} is a placeholder: "${t.trim()}".`);
        }
      }
    });
  }

  static _validateFillOptions(options, errors, warnings) {
    // Fill-in-blank items should NEVER have fabricated MCQ options.
    // If they do, it means the MCQ parser leaked in — reject.
    if (Array.isArray(options)) {
      const filledOptions = options
        .map(o => (typeof o === 'object' ? o.text : o) || '')
        .filter(t => t && t.trim().length > 0);

      if (filledOptions.length >= 2) {
        errors.push('Fill-in-blank question should not have MCQ options. Parser may have misrouted this question.');
      }
    }
  }

  static _validateTableOptions(options, errors, warnings, questionItem) {
    // Column matching items should preserve columnA/columnB structure.
    // If they have MCQ options but no column data, warn.
    const hasColumnData =
      (Array.isArray(questionItem.columnA) && questionItem.columnA.length > 0) ||
      (Array.isArray(questionItem.columnB) && questionItem.columnB.length > 0);

    if (!hasColumnData && Array.isArray(options)) {
      const filledOptions = options
        .map(o => (typeof o === 'object' ? o.text : o) || '')
        .filter(t => t && t.trim().length > 0);

      if (filledOptions.length >= 4) {
        warnings.push('Column-matching question has MCQ options but no structured column data. Consider re-routing.');
      }
    }
  }
}

module.exports = { QuestionValidator };
