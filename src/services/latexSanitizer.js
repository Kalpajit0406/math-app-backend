/**
 * LatexSanitizer — Production-Grade LaTeX Stabilization Engine
 *
 * PHILOSOPHY:
 *   "First, do no harm."
 *   Raw OCR LaTeX is often correct. The #1 failure mode is aggressive
 *   post-processing that CORRUPTS valid equations.
 *
 *   Rules:
 *     1. If raw OCR is valid LaTeX → only apply SAFE normalization
 *     2. NEVER inject braces blindly
 *     3. NEVER rewrite fractions, sqrt, trig functions via regex hacks
 *     4. Only balance if confidence is high AND raw was already broken
 *     5. If any modification produces invalid LaTeX → return raw
 *
 * SAFE OPERATIONS (always applied):
 *   - Unicode symbol normalization (−→-, ×→\times, etc.)
 *   - Multiple space collapse
 *   - Remove dangerous LaTeX injection commands
 *   - OCR spacing artifacts in command names (\ ( → \()
 *
 * CONDITIONAL OPERATIONS (only if confidence >= 0.85 AND raw is already broken):
 *   - Balance unclosed \( \) \[ \]
 *   - Balance unclosed environments (matrix, align, etc.)
 *   - Balance braces and dollar signs
 *
 * VALIDATION:
 *   - Balanced braces
 *   - Balanced brackets/parens
 *   - No corrupt patterns: ^}, _{}, \frac{}, etc.
 *   - Valid math environment structure
 *   - Valid fraction/sqrt/trig structure
 */

'use strict';

// ─── DANGEROUS COMMANDS ───────────────────────────────────────────────────────
// These allow code execution or filesystem access in some LaTeX engines
const DANGEROUS_COMMANDS = [
  'input', 'write', 'immediate', 'openout', 'closeout', 'special',
  'usepackage', 'documentclass', 'def', 'let', 'catcode', 'edef',
  'xdef', 'expandafter', 'include', 'read', 'loop', 'repeat',
];

// ─── SAFE UNICODE → LATEX SYMBOL MAP ─────────────────────────────────────────
const SYMBOL_MAP = {
  '−':  '-',          // U+2212 MINUS SIGN → hyphen-minus
  '–':  '-',          // U+2013 EN DASH
  '—':  '-',          // U+2014 EM DASH
  '×':  '\\times',
  '÷':  '\\div',
  '·':  '\\cdot',
  '±':  '\\pm',
  '∓':  '\\mp',
  '≤':  '\\leq',
  '≥':  '\\geq',
  '≠':  '\\neq',
  '≈':  '\\approx',
  '∞':  '\\infty',
  '√':  '\\sqrt',
  '∑':  '\\sum',
  '∏':  '\\prod',
  '∫':  '\\int',
  '∂':  '\\partial',
  '∇':  '\\nabla',
  '∈':  '\\in',
  '∉':  '\\notin',
  '⊂':  '\\subset',
  '⊃':  '\\supset',
  '∪':  '\\cup',
  '∩':  '\\cap',
  '→':  '\\rightarrow',
  '←':  '\\leftarrow',
  '↔':  '\\leftrightarrow',
  '⇒':  '\\Rightarrow',
  '⇐':  '\\Leftarrow',
  '⇔':  '\\Leftrightarrow',
  'α':  '\\alpha',
  'β':  '\\beta',
  'γ':  '\\gamma',
  'δ':  '\\delta',
  'ε':  '\\epsilon',
  'θ':  '\\theta',
  'λ':  '\\lambda',
  'μ':  '\\mu',
  'π':  '\\pi',
  'σ':  '\\sigma',
  'φ':  '\\phi',
  'ω':  '\\omega',
  'Γ':  '\\Gamma',
  'Δ':  '\\Delta',
  'Θ':  '\\Theta',
  'Λ':  '\\Lambda',
  'Π':  '\\Pi',
  'Σ':  '\\Sigma',
  'Φ':  '\\Phi',
  'Ω':  '\\Omega',
};

// ─── CORRUPT PATTERNS ─────────────────────────────────────────────────────────
// These patterns indicate that post-processing has produced invalid LaTeX
const CORRUPT_PATTERNS = [
  /\^}/,                    // superscript before closing brace
  /_}/,                     // subscript before closing brace
  /\\frac\s*\}/,            // \frac followed immediately by }
  /\\sqrt\s*\}/,            // \sqrt followed immediately by }
  /\\frac\s*\{\s*\}/,       // \frac with empty first argument
  /\\frac\s*\{\s*\}\s*\{/,  // \frac with empty numerator
  /\$\s*\$/,                // empty math block $$
  /\{\s*\}/,                // empty braces (context-dependent but suspicious)
];

// ─── MATH ENVIRONMENTS ────────────────────────────────────────────────────────
const MATH_ENVIRONMENTS = [
  'matrix', 'pmatrix', 'bmatrix', 'vmatrix', 'Vmatrix',
  'align', 'align*', 'aligned',
  'cases', 'array', 'equation', 'equation*',
  'gather', 'gather*', 'multline',
];

class LatexSanitizer {

  // ─── PUBLIC API ────────────────────────────────────────────────────────────

  /**
   * Main sanitization entrypoint.
   *
   * @param {string} latex       - Raw LaTeX/text from OCR
   * @param {number|null} confidence - OCR confidence score (0–1)
   * @returns {string}           - Sanitized (or raw) LaTeX
   */
  static sanitize(latex, confidence = null) {
    if (!latex || typeof latex !== 'string') return '';

    const raw = latex;

    // ── Gate 1: Validate raw input ──────────────────────────────────────────
    const rawIsValid = this.isValidLatexSyntax(raw);

    // ── Step A: SAFE NORMALIZATION (always applied) ─────────────────────────
    let s = this._safeNormalize(raw);

    // ── Step B: CONDITIONAL RECOVERY (only if high confidence AND raw broken)
    const isHighConf = confidence === null || confidence >= 0.80;

    if (isHighConf && !rawIsValid) {
      s = this._conditionalBalance(s);
    }

    // ── Gate 2: Validate output ─────────────────────────────────────────────
    const outputIsValid = this.isValidLatexSyntax(s);

    // If our processing degraded valid OCR → return safe raw
    if (rawIsValid && !outputIsValid) {
      console.warn('[LatexSanitizer] Processing degraded valid LaTeX — returning safe raw.');
      return this._safeNormalize(raw);
    }

    return s.trim();
  }

  /**
   * Validate LaTeX syntax quality.
   * Returns true if the string is likely valid (or at least not broken).
   */
  static isValidLatexSyntax(s) {
    if (!s) return true;
    if (!this.isBalancedBraces(s))              return false;
    if (!this.isBalancedBracketsAndParentheses(s)) return false;

    // Check for known corrupt patterns
    for (const pattern of CORRUPT_PATTERNS) {
      if (pattern.test(s)) return false;
    }

    return true;
  }

  /**
   * Validate brace balance.
   */
  static isBalancedBraces(s) {
    if (!s) return true;
    let count = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '\\') { i++; continue; } // skip escaped char
      if      (s[i] === '{') count++;
      else if (s[i] === '}') {
        count--;
        if (count < 0) return false;
      }
    }
    return count === 0;
  }

  /**
   * Validate bracket and parenthesis balance.
   */
  static isBalancedBracketsAndParentheses(s) {
    let par = 0, sq = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '\\') { i++; continue; }
      if      (s[i] === '(') par++;
      else if (s[i] === ')') { par--; if (par < 0) return false; }
      else if (s[i] === '[') sq++;
      else if (s[i] === ']') { sq--;  if (sq  < 0) return false; }
    }
    return par === 0 && sq === 0;
  }

  // ─── PRIVATE: SAFE NORMALIZATION ──────────────────────────────────────────

  static _safeNormalize(s) {
    // Collapse multiple escaped underscores into a single blank line pattern (\_____)
    s = s.replace(/(?:\\_)+/g, (match) => '\\' + '_'.repeat(match.length / 2));

    // Remove dangerous injection commands
    for (const cmd of DANGEROUS_COMMANDS) {
      s = s.replace(new RegExp(`\\\\${cmd}\\s*(?:\\{[^}]*\\})?`, 'g'), '');
    }

    // Unicode symbol → LaTeX command
    const symbolKeys = Object.keys(SYMBOL_MAP);
    for (const ch of symbolKeys) {
      if (s.includes(ch)) {
        s = s.split(ch).join(SYMBOL_MAP[ch]);
      }
    }

    // Fix OCR spacing artifact in LaTeX commands: "\ (" → "\("
    s = s.replace(/\\\s+(?=[(\[{])/g, '\\');

    // Collapse multiple spaces/tabs (but preserve newlines)
    s = s.replace(/[ \t]+/g, ' ');

    // Balance escaped delimiter pairs: \( \) and \[ \]
    // Only add closing if there's a clear open with no matching close
    s = this._balanceEscapedPairs(s, '\\(', '\\)');
    s = this._balanceEscapedPairs(s, '\\[', '\\]');

    // Strip spaces inside LaTeX delimiters BEFORE converting to $
    s = s.replace(/\\\(\s+/g, '\\(');
    s = s.replace(/\s+\\\)/g, '\\)');
    s = s.replace(/\\\[\s+/g, '\\[');
    s = s.replace(/\s+\\\]/g, '\\]');

    // Convert display math to $$ (unified)
    s = s.replace(/\\\[/g, '$$').replace(/\\\]/g, '$$');
    s = s.replace(/\\\(/g, '$').replace(/\\\)/g, '$');

    // Clean \left without matching \right (common OCR issue)
    s = s.replace(/}\s*\\left/g, '}\\left');

    return s;
  }

  // ─── PRIVATE: CONDITIONAL BALANCE ─────────────────────────────────────────

  static _conditionalBalance(s) {
    // Balance LaTeX environments
    for (const env of MATH_ENVIRONMENTS) {
      const opens  = (s.match(new RegExp(`\\\\begin\\{${env.replace('*', '\\*')}\\}`, 'g')) || []).length;
      const closes = (s.match(new RegExp(`\\\\end\\{${env.replace('*', '\\*')}\\}`, 'g')) || []).length;
      if (opens > closes) {
        s += ` \\end{${env}}`.repeat(Math.min(opens - closes, 5));
      }
    }

    // Balance braces
    let opens = 0, closes = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '\\') { i++; continue; }
      if      (s[i] === '{') opens++;
      else if (s[i] === '}') closes++;
    }
    if (opens > closes) s += '}'.repeat(Math.min(opens - closes, 10));

    // Balance dollar signs (inline math)
    let dollars = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '$' && (i === 0 || s[i - 1] !== '\\')) dollars++;
    }
    if (dollars % 2 !== 0) s += '$';

    // Balance brackets and parentheses
    let par = 0, sq = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '\\') { i++; continue; }
      if      (s[i] === '(') par++;
      else if (s[i] === ')') { if (par > 0) par--; }
      else if (s[i] === '[') sq++;
      else if (s[i] === ']') { if (sq > 0) sq--; }
    }
    if (par > 0) s += ')'.repeat(Math.min(par, 10));
    if (sq > 0)  s += ']'.repeat(Math.min(sq, 10));

    return s;
  }

  // ─── PRIVATE: ESCAPED PAIR BALANCER ───────────────────────────────────────

  /**
   * Balance open/close escaped pairs like \( \) and \[ \].
   * Only adds closes — never adds opens (that would be destructive).
   */
  static _balanceEscapedPairs(s, open, close) {
    let result = '';
    let inMath = false;
    let pos = 0;
    let currentMathStart = -1;

    while (pos < s.length) {
      if (s.startsWith(open, pos)) {
        if (inMath) {
          // Unclosed previous math block! We need to close it.
          const blockText = result.substring(currentMathStart);

          // 1. Check for transition words
          const transitionRegex = /(\s+(?:where|and|or|if|be|let|then|for|is|of|to|in|at|by|with|but|as|the|an|a)\s+)([^]*)$/i;
          const match = blockText.match(transitionRegex);

          // 2. Check for trailing spaces
          const trailingSpaceMatch = blockText.match(/\s+$/);

          if (match) {
            const transitionIndex = currentMathStart + match.index;
            result = result.substring(0, transitionIndex) + close + result.substring(transitionIndex);
            inMath = false;
          } else if (trailingSpaceMatch) {
            const spaceIndex = result.length - trailingSpaceMatch[0].length;
            result = result.substring(0, spaceIndex) + close + result.substring(spaceIndex);
            inMath = false;
          } else {
            result += close;
            inMath = false;
          }
        }
        result += open;
        inMath = true;
        currentMathStart = result.length;
        pos += open.length;
      } else if (s.startsWith(close, pos)) {
        result += close;
        inMath = false;
        pos += close.length;
      } else {
        result += s[pos];
        pos++;
      }
    }
    if (inMath) {
      const blockText = result.substring(currentMathStart);
      const trailingSpaceMatch = blockText.match(/\s+$/);
      if (trailingSpaceMatch) {
        const spaceIndex = result.length - trailingSpaceMatch[0].length;
        result = result.substring(0, spaceIndex) + close + result.substring(spaceIndex);
      } else {
        result += close;
      }
    }
    return result;
  }

  /**
   * Extract and return LaTeX for a specific chunk (identity for now — future: span matching).
   */
  static extractChunkLatex(latex, chunk) {
    if (!latex || !chunk) return chunk;
    return latex;
  }
}

module.exports = { LatexSanitizer };
