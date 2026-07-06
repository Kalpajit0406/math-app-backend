/**
 * ConfidenceScorer — Phase 10: Multi-Signal Confidence Computation
 *
 * PRODUCES:
 *   questionConfidence  : 0.0–1.0  — quality of question text
 *   optionsConfidence   : 0.0–1.0  — quality of options (filled, unique, no artefacts)
 *   answerConfidence    : 0.0–1.0  — confidence in the extracted answer
 *   latexConfidence     : 0.0–1.0  — LaTeX syntax validity
 *   overallConfidence   : 0.0–1.0  — weighted composite
 *   rating              : 'high' | 'medium' | 'low'
 *   breakdown           : object   — per-signal weights
 *
 * ROUTING DECISION:
 *   overallConfidence >= 0.75  → ACCEPTED  (auto-import to question bank)
 *   overallConfidence >= 0.50  → PREVIEW   (manual review before saving)
 *   overallConfidence <  0.50  → QUARANTINE (manual review required)
 */

'use strict';

const { LatexNormalizer } = require('./latexSanitizer');

// ─── WEIGHTS ─────────────────────────────────────────────────────────────────
const W = {
  ocr:              0.15,
  questionText:     0.20,
  optionIntegrity:  0.20,
  answerPresence:   0.10,
  latexQuality:     0.15,
  semanticScore:    0.10,
  boundary:         0.10,
};

// ─── SEMANTIC SIGNALS ─────────────────────────────────────────────────────────
const MATH_KEYWORDS = /\b(?:find|evaluate|solve|equals?|determine|calculate|prove|show|simplify|integrate|differentiate|matrix|equation|probability|triangle|circle|derivative|angle|sum|product|ratio|fraction|expression|value|what|how|where|verify|construct|maximum|minimum|range|domain|limit|function|variable|coefficient|exponent|logarithm|সরল|সমাধান|মান|নির্ণয়|প্রমাণ|বিস্তার)\b/i;

const MATH_SYMBOLS = /[+\-=*/^\\{}[\]|<>∫∑∏√±≤≥≠≈∞αβγδεθλμπσφω\$]/;

// Garbage / OCR noise character ratio threshold
const GARBAGE_CHARS_RE = /[^a-zA-Z0-9\s+\-=*/^$\\_{}[\]()|<>.,;?!:θπαβγδεθλμπσφω∫∑∏√±≤≥≠≈∞\u0980-\u09FF]/g;

function garbageRatio(text) {
  if (!text || !text.trim()) return 0;
  const junk = (text.match(GARBAGE_CHARS_RE) || []).length;
  return junk / text.length;
}

function semanticScore(questionText) {
  if (!questionText || !questionText.trim()) return 0.0;
  const garbage = garbageRatio(questionText);
  if (garbage > 0.50) return 0.30;
  if (MATH_SYMBOLS.test(questionText) || MATH_KEYWORDS.test(questionText)) return 1.0;
  if (questionText.trim().length > 20) return 0.75;  // Bengali text without math symbols
  return 0.60;
}

// ─── MAIN CLASS ───────────────────────────────────────────────────────────────

class ConfidenceScorer {

  /**
   * Compute full confidence breakdown for a parsed question.
   *
   * @param {object} params
   * @param {number}  params.ocrConfidence     - Raw OCR provider confidence (0–1)
   * @param {string}  params.questionText      - Parsed question text
   * @param {Array}   params.options           - [{label, text}] × 4
   * @param {string}  params.correctOption     - 'A'|'B'|'C'|'D' or null
   * @param {string}  params.questionNumber    - Question number or null
   * @param {boolean} params.hasDuplicateOptions
   * @returns {ConfidenceResult}
   */
  static compute({
    ocrConfidence     = null,
    questionText      = '',
    options           = [],
    correctOption     = null,
    questionNumber    = null,
    hasDuplicateOptions = false,
  } = {}) {

    // ── OCR confidence — Mathpix-adjusted ─────────────────────────────────
    // Mathpix sometimes returns near-zero confidence (0.001–0.01) even for
    // pages it extracts perfectly well (4000+ chars). We treat any confidence
    // below 0.10 as "unreliable" and substitute a neutral floor of 0.70
    // so it doesn't destroy the composite score for otherwise good extractions.
    const rawOcr = ocrConfidence != null ? Math.max(0, Math.min(1, ocrConfidence)) : 0.80;
    const ocr = rawOcr < 0.10 ? 0.70 : rawOcr;

    // ── Question text confidence ───────────────────────────────────────────
    const qText = (questionText || '').trim();
    let questionConf = 0.0;
    if (qText.length >= 10) {
      questionConf = 0.90;
    } else if (qText.length >= 5) {
      questionConf = 0.60;
    } else {
      questionConf = 0.10;
    }
    // Penalize placeholders
    if (/^(?:Question\s*(?:Text)?|Q\.?No\.?|undefined|null)$/i.test(qText)) {
      questionConf = 0.0;
    }
    // Penalize garbage
    const garbage = garbageRatio(qText);
    if (garbage > 0.40) questionConf *= 0.30;
    else if (garbage > 0.20) questionConf *= 0.70;

    // ── Option integrity confidence ────────────────────────────────────────
    const isMCQ = Array.isArray(options) && options.length === 4;
    let optConf = 1.0;
    if (isMCQ) {
      const filled = options.filter(o => o.text && o.text.trim().length > 0).length;
      if (filled === 4) optConf = 1.0;
      else if (filled === 3) optConf = 0.75;
      else if (filled === 2) optConf = 0.45;
      else optConf = 0.0;

      if (hasDuplicateOptions) optConf *= 0.50;
    }

    // ── Answer presence confidence ─────────────────────────────────────────
    const ansConf = correctOption ? 1.0 : 0.40;

    // ── LaTeX quality confidence ───────────────────────────────────────────
    let latexConf = 1.0;
    try {
      if (!LatexNormalizer.isValidSyntax(qText)) latexConf = 0.50;
      // Count unclosed braces
      let open = 0;
      for (let i = 0; i < qText.length; i++) {
        if (qText[i] === '\\') { i++; continue; }
        if (qText[i] === '{') open++;
        else if (qText[i] === '}') open = Math.max(0, open - 1);
      }
      if (open > 0) latexConf = Math.max(0.30, 1.0 - open * 0.15);
    } catch (_) {
      latexConf = 0.50;
    }

    // ── Semantic confidence ────────────────────────────────────────────────
    const semConf = semanticScore(qText);

    // ── Boundary confidence ────────────────────────────────────────────────
    let boundaryConf = questionNumber != null ? 1.0 : 0.70;
    // Penalize if question text contains embedded question numbers (bleed)
    if (/\n\s*\d{1,3}[\.):\-]\s+[A-Z\u0980-\u09FF]/.test(qText)) {
      boundaryConf = Math.max(0, boundaryConf - 0.30);
    }

    // ── Composite ─────────────────────────────────────────────────────────
    const composite =
      (ocr           * W.ocr)            +
      (questionConf  * W.questionText)   +
      (optConf       * W.optionIntegrity)+
      (ansConf       * W.answerPresence) +
      (latexConf     * W.latexQuality)   +
      (semConf       * W.semanticScore)  +
      (boundaryConf  * W.boundary);

    const clamped = Math.max(0, Math.min(1, composite));
    const rating  = clamped >= 0.75 ? 'high' : clamped >= 0.50 ? 'medium' : 'low';

    return {
      questionConfidence:  questionConf,
      optionsConfidence:   optConf,
      answerConfidence:    ansConf,
      latexConfidence:     latexConf,
      overallConfidence:   clamped,
      ocrConfidence:       ocr,
      semanticConfidence:  semConf,
      boundaryConfidence:  boundaryConf,
      rating,
      breakdown: {
        ocr:       (ocr          * W.ocr).toFixed(3),
        question:  (questionConf * W.questionText).toFixed(3),
        options:   (optConf      * W.optionIntegrity).toFixed(3),
        answer:    (ansConf      * W.answerPresence).toFixed(3),
        latex:     (latexConf    * W.latexQuality).toFixed(3),
        semantic:  (semConf      * W.semanticScore).toFixed(3),
        boundary:  (boundaryConf * W.boundary).toFixed(3),
      },
    };
  }

  /**
   * Determine extraction routing state from confidence.
   *
   * @param {ConfidenceResult} conf
   * @param {string[]}         quarantineReasons
   * @returns {'ACCEPTED'|'PREVIEW'|'QUARANTINED'}
   */
  static routingDecision(conf, quarantineReasons = []) {
    if (quarantineReasons.length > 0) return 'QUARANTINED';
    if (conf.overallConfidence >= 0.75) return 'ACCEPTED';
    if (conf.overallConfidence >= 0.50) return 'PREVIEW';
    return 'QUARANTINED';
  }
}

module.exports = { ConfidenceScorer };
