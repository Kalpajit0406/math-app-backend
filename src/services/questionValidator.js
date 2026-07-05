/**
 * QuestionValidator — Phase 9: Extraction Validation Gate
 *
 * REJECTS extraction if ANY of the following:
 *   ✗ Question text is empty
 *   ✗ Question text is a placeholder (< 5 chars, "Question Text", etc.)
 *   ✗ Fewer than 4 options for MCQ questions
 *   ✗ No answer detected (goes to PREVIEW, not REJECTED)
 *   ✗ Duplicate option texts
 *   ✗ OCR confidence below threshold (0.30)
 *   ✗ Question is a pure answer-key fragment
 *   ✗ Question is a section header leak
 *   ✗ Parser artefact detected in question or options
 *
 * SENDS TO MANUAL REVIEW:
 *   - 2 or 3 filled options (incomplete MCQ)
 *   - Low OCR confidence (0.30 – 0.60)
 *   - Missing answer badge
 *   - LaTeX confidence below 0.60
 *
 * OUTPUT:
 *   { isValid: boolean, errors: string[], warnings: string[], quarantineReasons: string[] }
 */

'use strict';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MIN_QUESTION_LENGTH = 5;

// ─── PLACEHOLDER PATTERNS ─────────────────────────────────────────────────────
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

// ─── ANSWER KEY LEAK ──────────────────────────────────────────────────────────
const ANSWER_LEAK_PATTERNS = [
  /^\s*\(?[a-dA-Dকখগঘ১-৪i-ivI-IV]\)?\s*$/,   // single letter option label
  /^\d{1,3}\s*[.):\s]\s*\(?[a-dA-D]\)?\s*$/,   // "5. B"
];

// ─── SECTION HEADER LEAK ──────────────────────────────────────────────────────
const SECTION_HEADER_PATTERNS = [
  /^(?:EXERCISE|CHAPTER|UNIT|Conventional\s*Type|HS\s*CORNER|Multiple\s*Choice\s*Questions|Fill\s*in\s*the\s*Blank|Column\s*Match(?:ing)?|Analytical\s*Type|Short\s*Answer\s*Type|Long\s*Answer\s*Type|উত্তরমালা|উত্তর|Answers?\s*Key)\s*$/i,
];

// ─── PARSER ARTEFACT PATTERNS ─────────────────────────────────────────────────
const ARTIFACT_PATTERNS = [
  /^[&\s]+$/,            // only ampersands (LaTeX column separator leak)
  /^\\(?:hline|cline)/,  // table rule commands
  /^[|]+$/,              // only pipe chars
  /^\s*[{}]\s*$/,        // lone braces
  /^\\{\\}$/,            // escaped empty braces
];

// ─── HELPER: option text validation ───────────────────────────────────────────
function isValidOptionText(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (t.length < 1) return false;
  if (PLACEHOLDER_PATTERNS.some(p => p.test(t))) return false;
  if (ARTIFACT_PATTERNS.some(p => p.test(t))) return false;
  return true;
}

// ─── MAIN CLASS ───────────────────────────────────────────────────────────────

class QuestionValidator {

  /**
   * Validate a fully parsed and enriched question object.
   *
   * @param {object} q - Parsed question object
   * @returns {{ isValid: boolean, errors: string[], warnings: string[], quarantineReasons: string[] }}
   */
  static validate(q) {
    if (!q) return { isValid: false, errors: ['Question is null'], warnings: [], quarantineReasons: ['MISSING_QUESTION'] };

    const errors           = [];
    const warnings         = [];
    const quarantineReasons = [];

    const qText      = (q.question || q.questionText || '').trim();
    const format     = (q.format || '').toLowerCase();
    const options    = q.options;
    const confidence = q.ocrConfidence ?? q.confidence ?? 1.0;

    // ── 1. Question text presence ─────────────────────────────────────────
    if (!qText) {
      errors.push('Question text is empty.');
      quarantineReasons.push('MISSING_QUESTION');
    } else {
      // ── 2. Minimum length ─────────────────────────────────────────────
      if (qText.length < MIN_QUESTION_LENGTH) {
        errors.push(`Question too short (${qText.length} chars).`);
        quarantineReasons.push('MISSING_QUESTION');
      }

      // ── 3. Placeholder check ──────────────────────────────────────────
      if (PLACEHOLDER_PATTERNS.some(p => p.test(qText))) {
        errors.push(`Question is a parser placeholder: "${qText}".`);
        quarantineReasons.push('MISSING_QUESTION');
      }

      // ── 4. Answer key leak ────────────────────────────────────────────
      if (ANSWER_LEAK_PATTERNS.some(p => p.test(qText))) {
        errors.push(`Question matches an answer-key pattern: "${qText}".`);
        quarantineReasons.push('ANSWER_KEY_LEAK');
      }

      // ── 5. Section header leak ────────────────────────────────────────
      if (SECTION_HEADER_PATTERNS.some(p => p.test(qText))) {
        errors.push(`Question is a section header: "${qText}".`);
        quarantineReasons.push('SECTION_HEADER_LEAK');
      }

      // ── 6. Parser artefact ────────────────────────────────────────────
      if (ARTIFACT_PATTERNS.some(p => p.test(qText))) {
        errors.push(`Question is a parser artefact: "${qText}".`);
        quarantineReasons.push('OCR_CORRUPTION');
      }
    }

    // ── 7. Format-specific validation ────────────────────────────────────
    const isMCQ   = !['fill_in_blank', 'fill', 'column_matching', 'table', 'descriptive'].includes(format);
    const isFill  = format === 'fill_in_blank' || format === 'fill';
    const isTable = format === 'column_matching' || format === 'table';

    if (isMCQ) {
      this._validateMCQOptions(options, errors, warnings, quarantineReasons);
    } else if (isFill) {
      this._validateFillOptions(options, errors, warnings);
    } else if (isTable) {
      this._validateTableOptions(options, errors, warnings, q);
    }

    // ── 8. OCR confidence threshold ───────────────────────────────────────
    if (confidence < 0.30) {
      errors.push(`OCR confidence critically low (${(confidence * 100).toFixed(0)}%).`);
      quarantineReasons.push('OCR_CONFIDENCE_CRITICAL');
    } else if (confidence < 0.60) {
      warnings.push(`Low OCR confidence (${(confidence * 100).toFixed(0)}%). Review recommended.`);
    }

    // ── 9. Answer absence warning ─────────────────────────────────────────
    if (!q.correctOption && !q.correctAnswer) {
      warnings.push('No answer badge detected. Manual review recommended.');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      quarantineReasons,
    };
  }

  // ─── FORMAT VALIDATORS ───────────────────────────────────────────────────────

  static _validateMCQOptions(options, errors, warnings, quarantineReasons) {
    if (!Array.isArray(options)) {
      errors.push('MCQ options must be an array.');
      quarantineReasons.push('MISSING_OPTIONS');
      return;
    }

    const texts  = options.map(o => (typeof o === 'object' ? o.text : String(o || '')));
    const filled = texts.filter(t => isValidOptionText(t));

    // Phase 9 rule: reject if fewer than 4 options (not even 2 threshold)
    if (filled.length < 4) {
      if (filled.length === 0) {
        errors.push('MCQ has no valid options.');
        quarantineReasons.push('MISSING_OPTIONS');
      } else if (filled.length < 2) {
        errors.push(`MCQ has only ${filled.length} option(s). Minimum 4 required.`);
        quarantineReasons.push('MISSING_OPTIONS');
      } else {
        // 2–3 options → PREVIEW (not QUARANTINE)
        warnings.push(`MCQ has only ${filled.length} options. Expected 4. Sent to Preview.`);
      }
    }

    // Duplicate option texts
    const unique = new Set(filled.map(t => t.trim().toLowerCase()));
    if (unique.size < filled.length) {
      errors.push('Duplicate option texts detected.');
      quarantineReasons.push('DUPLICATE_OPTIONS');
    }

    // Check individual options for artefacts
    texts.forEach((t, i) => {
      if (t && t.trim()) {
        const label = (options[i] && options[i].label) || String.fromCharCode(65 + i);
        if (ARTIFACT_PATTERNS.some(p => p.test(t.trim()))) {
          errors.push(`Option ${label} contains a parser artefact.`);
          quarantineReasons.push('OCR_CORRUPTION');
        }
        if (PLACEHOLDER_PATTERNS.some(p => p.test(t.trim()))) {
          errors.push(`Option ${label} is a placeholder.`);
        }
      }
    });
  }

  static _validateFillOptions(options, errors, warnings) {
    if (Array.isArray(options)) {
      const filled = options
        .map(o => (typeof o === 'object' ? o.text : o) || '')
        .filter(t => t && t.trim().length > 0);
      if (filled.length >= 2) {
        warnings.push('Fill-in-blank question has MCQ-style options. Parser may have misrouted.');
      }
    }
  }

  static _validateTableOptions(options, errors, warnings, q) {
    const hasColumnData =
      (Array.isArray(q.columnA) && q.columnA.length > 0) ||
      (Array.isArray(q.columnB) && q.columnB.length > 0);
    if (!hasColumnData) {
      warnings.push('Column-matching question has no column A/B data. Consider re-routing.');
    }
  }
}

module.exports = { QuestionValidator };
