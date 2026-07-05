/**
 * LatexNormalizer — Phase 7: LaTeX Formula Normalization
 *
 * PHILOSOPHY: "First, do no harm."
 *   Raw OCR LaTeX is often correct.
 *   The #1 failure mode is aggressive post-processing that corrupts valid equations.
 *
 * SAFE OPERATIONS (always applied):
 *   - Unicode math symbol → LaTeX command  (−→-, ×→\times, ∫→\int, α→\alpha …)
 *   - Remove dangerous LaTeX injection commands (input, write, include …)
 *   - Fix OCR spacing artifacts in command names  "\ (" → "\("
 *   - Remove \boldsymbol, \mathbf, \mathit wrappers (common Mathpix artefacts)
 *   - Normalize \operatorname{sin} → \sin
 *   - Normalize blank placeholders: $____$ → ---
 *   - Collapse multiple spaces/tabs (preserve newlines)
 *   - Unified math delimiter style: \[ \] → $$  /  \( \) → $
 *
 * CONDITIONAL OPERATIONS (only if confidence ≥ 0.80 AND raw LaTeX is broken):
 *   - Balance unclosed environments (matrix, align, cases …)
 *   - Balance unclosed math delimiters
 *   - Balance unmatched braces (within math blocks)
 *
 * VALIDATION:
 *   - Balanced braces
 *   - Balanced brackets and parentheses
 *   - No corrupt patterns: ^}, \frac{}, $$ (empty), etc.
 *   - Valid fraction/sqrt structure
 *
 * CONSISTENT STYLE RULES:
 *   - Inline math:   $...$
 *   - Display math:  $$...$$
 *   - Never mix raw OCR symbols with LaTeX in the same formula block
 */

'use strict';

// ─── DANGEROUS COMMANDS ───────────────────────────────────────────────────────
const DANGEROUS_COMMANDS = [
  'input', 'write', 'immediate', 'openout', 'closeout', 'special',
  'usepackage', 'documentclass', 'def', 'let', 'catcode', 'edef',
  'xdef', 'expandafter', 'include', 'read', 'loop', 'repeat',
];

// ─── UNICODE → LATEX SYMBOL MAP ───────────────────────────────────────────────
const SYMBOL_MAP = {
  // Arithmetic
  '−':  '-',
  '–':  '-',
  '—':  '-',
  '×':  '\\times',
  '÷':  '\\div',
  '·':  '\\cdot',
  '±':  '\\pm',
  '∓':  '\\mp',
  // Comparison
  '≤':  '\\leq',
  '≥':  '\\geq',
  '≠':  '\\neq',
  '≈':  '\\approx',
  '≡':  '\\equiv',
  '≅':  '\\cong',
  '∝':  '\\propto',
  // Sets
  '∈':  '\\in',
  '∉':  '\\notin',
  '⊂':  '\\subset',
  '⊃':  '\\supset',
  '⊆':  '\\subseteq',
  '⊇':  '\\supseteq',
  '∪':  '\\cup',
  '∩':  '\\cap',
  '∅':  '\\emptyset',
  '∀':  '\\forall',
  '∃':  '\\exists',
  // Calculus
  '∞':  '\\infty',
  '√':  '\\sqrt',
  '∑':  '\\sum',
  '∏':  '\\prod',
  '∫':  '\\int',
  '∬':  '\\iint',
  '∭':  '\\iiint',
  '∮':  '\\oint',
  '∂':  '\\partial',
  '∇':  '\\nabla',
  '∆':  '\\Delta',
  // Logic
  '∧':  '\\wedge',
  '∨':  '\\vee',
  '¬':  '\\neg',
  '⊕':  '\\oplus',
  // Arrows
  '→':  '\\rightarrow',
  '←':  '\\leftarrow',
  '↔':  '\\leftrightarrow',
  '⇒':  '\\Rightarrow',
  '⇐':  '\\Leftarrow',
  '⇔':  '\\Leftrightarrow',
  '↑':  '\\uparrow',
  '↓':  '\\downarrow',
  '↕':  '\\updownarrow',
  // Greek lowercase
  'α':  '\\alpha',
  'β':  '\\beta',
  'γ':  '\\gamma',
  'δ':  '\\delta',
  'ε':  '\\epsilon',
  'ζ':  '\\zeta',
  'η':  '\\eta',
  'θ':  '\\theta',
  'ι':  '\\iota',
  'κ':  '\\kappa',
  'λ':  '\\lambda',
  'μ':  '\\mu',
  'ν':  '\\nu',
  'ξ':  '\\xi',
  'π':  '\\pi',
  'ρ':  '\\rho',
  'σ':  '\\sigma',
  'τ':  '\\tau',
  'υ':  '\\upsilon',
  'φ':  '\\phi',
  'χ':  '\\chi',
  'ψ':  '\\psi',
  'ω':  '\\omega',
  // Greek uppercase
  'Γ':  '\\Gamma',
  'Δ':  '\\Delta',
  'Θ':  '\\Theta',
  'Λ':  '\\Lambda',
  'Ξ':  '\\Xi',
  'Π':  '\\Pi',
  'Σ':  '\\Sigma',
  'Υ':  '\\Upsilon',
  'Φ':  '\\Phi',
  'Ψ':  '\\Psi',
  'Ω':  '\\Omega',
  // Misc math
  '°':  '^{\\circ}',
  '′':  "'",
  '″':  "''",
  '⋅':  '\\cdot',
  '…':  '\\ldots',
};

// ─── CORRUPT PATTERNS ─────────────────────────────────────────────────────────
const CORRUPT_PATTERNS = [
  /\^}/,                        // superscript before closing brace
  /_}/,                         // subscript before closing brace
  /\\frac\s*\}/,                // \frac followed by }
  /\\sqrt\s*\}/,                // \sqrt followed by }
  /\\frac\s*\{\s*\}/,           // \frac with empty first arg
  /\\frac\s*\{\s*\}\s*\{/,      // \frac with empty numerator
  /\$\s*\$/,                    // $$ (empty math)
];

// ─── MATH ENVIRONMENTS ────────────────────────────────────────────────────────
const MATH_ENVIRONMENTS = [
  'matrix', 'pmatrix', 'bmatrix', 'vmatrix', 'Vmatrix', 'Bmatrix',
  'align', 'align*', 'aligned', 'alignat', 'alignat*',
  'cases', 'array', 'equation', 'equation*',
  'gather', 'gather*', 'multline', 'split',
  'eqnarray', 'eqnarray*',
];

// ─── TRIG / FUNCTION MAP ──────────────────────────────────────────────────────
const TRIG_MAP = {
  'sin': '\\sin', 'cos': '\\cos', 'tan': '\\tan',
  'cot': '\\cot', 'sec': '\\sec', 'csc': '\\csc',
  'log': '\\log', 'ln':  '\\ln',  'exp': '\\exp',
  'lim': '\\lim', 'max': '\\max', 'min': '\\min',
  'det': '\\det', 'gcd': '\\gcd', 'sup': '\\sup',
  'inf': '\\inf', 'arg': '\\arg',
  'Re':  '\\Re',  'Im':  '\\Im',
  'deg': '\\deg', 'dim': '\\dim', 'ker': '\\ker',
  'sgn': '\\operatorname{sgn}',
  'rank': '\\operatorname{rank}',
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function countChar(str, ch) {
  let n = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\\') { i++; continue; }
    if (str[i] === ch) n++;
  }
  return n;
}

function balanceBraces(str) {
  let open = 0, extra = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\\') { i++; continue; }
    if (str[i] === '{') open++;
    else if (str[i] === '}') {
      if (open > 0) open--;
      else extra++;
    }
  }
  // Prepend missing opens and append missing closes
  return '{'.repeat(extra) + str + '}'.repeat(open);
}

function balanceParens(str) {
  let par = 0, sq = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\\') { i++; continue; }
    if      (str[i] === '(') par++;
    else if (str[i] === ')') { if (par > 0) par--; }
    else if (str[i] === '[') sq++;
    else if (str[i] === ']') { if (sq > 0) sq--; }
  }
  if (par > 0) str += ')'.repeat(Math.min(par, 10));
  if (sq > 0)  str += ']'.repeat(Math.min(sq, 10));
  return str;
}

// ─── MAIN CLASS ───────────────────────────────────────────────────────────────

class LatexNormalizer {

  /**
   * Main sanitization / normalization entry point.
   *
   * @param {string}      latex      - Raw LaTeX/text from OCR
   * @param {number|null} confidence - OCR confidence (0–1)
   * @returns {string}               - Normalized LaTeX
   */
  static normalize(latex, confidence = null) {
    if (!latex || typeof latex !== 'string') return '';

    const raw = latex;
    const rawValid = this.isValidSyntax(raw);

    // Step A: Safe normalization (always)
    let s = this._safeNormalize(raw);

    // Step B: Conditional recovery (only if high confidence AND raw was broken)
    const isHighConf = confidence === null || confidence >= 0.80;
    if (isHighConf && !rawValid) {
      s = this._conditionalBalance(s);
    }

    // Gate: if processing degraded valid LaTeX, return safe raw
    if (rawValid && !this.isValidSyntax(s)) {
      console.warn('[LatexNormalizer] Processing degraded valid LaTeX — returning safe normalized raw.');
      return this._safeNormalize(raw);
    }

    return s.trim();
  }

  // Keep backward-compatible alias
  static sanitize(latex, confidence = null) {
    return this.normalize(latex, confidence);
  }

  /**
   * Validate LaTeX syntax.
   */
  static isValidSyntax(s) {
    if (!s) return true;
    if (!this.isBalancedBraces(s)) return false;
    if (!this.isBalancedParens(s))  return false;
    for (const p of CORRUPT_PATTERNS) {
      if (p.test(s)) return false;
    }
    return true;
  }

  // Backward-compatible alias
  static isValidLatexSyntax(s) { return this.isValidSyntax(s); }

  static isBalancedBraces(s) {
    if (!s) return true;
    let count = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '\\') { i++; continue; }
      if      (s[i] === '{') count++;
      else if (s[i] === '}') { count--; if (count < 0) return false; }
    }
    return count === 0;
  }

  static isBalancedParens(s) {
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

  // Backward-compatible alias
  static isBalancedBracketsAndParentheses(s) { return this.isBalancedParens(s); }

  // ─── PRIVATE: SAFE NORMALIZATION ────────────────────────────────────────────

  static _safeNormalize(s) {
    // ── Remove Mathpix formatting artefacts ─────────────────────────────────
    s = s.replace(/\\boldsymbol\s*\{([^}]*)\}/g, '$1');
    s = s.replace(/\\mathbf\s*\{([^}]*)\}/g, '$1');
    s = s.replace(/\\mathit\s*\{([^}]*)\}/g, '$1');
    s = s.replace(/\\mathrm\s*\{([^}]*)\}/g, '$1');
    s = s.replace(/\\text\s*\{([^}]*)\}/g, '$1');  // unwrap \text in math

    // ── Normalize \operatorname ──────────────────────────────────────────────
    // "\operatorname { s i n }" → "\sin"
    s = s.replace(/\\operatorname\s*\{\s*([a-zA-Z](?:\s+[a-zA-Z])+)\s*\}/g, (_, spaced) => {
      const compact = spaced.replace(/\s+/g, '');
      return TRIG_MAP[compact] || `\\operatorname{${compact}}`;
    });
    // "\operatorname{sin}" → "\sin"
    s = s.replace(/\\operatorname\s*\{\s*(\w+)\s*\}/g, (_, name) => TRIG_MAP[name] || `\\operatorname{${name}}`);

    // ── Blank placeholder normalization ─────────────────────────────────────
    s = s.replace(/\$\s*(?:_+|\\_+|\.{3,})\s*\$/g, '---');
    s = s.replace(/\\\[\s*(?:_+|\\_+|\.{3,})\s*\\\]/g, '---');
    s = s.replace(/(?<![\\$])_{4,}(?![{\w])/g, '---');
    s = s.replace(/-{3,}/g, '---');

    // ── Remove dangerous injection commands ─────────────────────────────────
    for (const cmd of DANGEROUS_COMMANDS) {
      s = s.replace(new RegExp(`\\\\${cmd}\\s*(?:\\{[^}]*\\})?`, 'g'), '');
    }

    // ── Unicode symbol → LaTeX command ──────────────────────────────────────
    for (const [ch, cmd] of Object.entries(SYMBOL_MAP)) {
      if (s.includes(ch)) s = s.split(ch).join(cmd);
    }

    // ── Fix OCR spacing artifact in LaTeX commands: "\ (" → "\(" ────────────
    s = s.replace(/\\\s+(?=[([\{])/g, '\\');

    // ── Collapse multiple spaces/tabs ────────────────────────────────────────
    s = s.replace(/[ \t]+/g, ' ');

    // ── Balance escaped delimiter pairs: \( \) and \[ \] ─────────────────────
    s = this._balanceEscapedPairs(s, '\\(', '\\)');
    s = this._balanceEscapedPairs(s, '\\[', '\\]');

    // ── Strip spaces inside LaTeX delimiters ────────────────────────────────
    s = s.replace(/\\\(\s+/g, '\\(').replace(/\s+\\\)/g, '\\)');
    s = s.replace(/\\\[\s+/g, '\\[').replace(/\s+\\\]/g, '\\]');

    // ── Unified delimiter style: \[ \] → $$  /  \( \) → $ ──────────────────
    s = s.replace(/\\\[/g, '$$').replace(/\\\]/g, '$$');
    s = s.replace(/\\\(/g, '$').replace(/\\\)/g, '$');

    return s;
  }

  // ─── PRIVATE: CONDITIONAL BALANCE ───────────────────────────────────────────

  static _conditionalBalance(s) {
    // Balance math environments
    for (const env of MATH_ENVIRONMENTS) {
      const escapedEnv = env.replace('*', '\\*');
      const opens  = (s.match(new RegExp(`\\\\begin\\{${escapedEnv}\\}`, 'g')) || []).length;
      const closes = (s.match(new RegExp(`\\\\end\\{${escapedEnv}\\}`,   'g')) || []).length;
      if (opens > closes) {
        s += ` \\end{${env}}`.repeat(Math.min(opens - closes, 5));
      }
    }

    // Balance math segments
    return this._balanceMathSegments(s);
  }

  static _balanceMathSegments(text) {
    let out = '';
    let pos  = 0;
    let inDisplay = false;
    let inInline  = false;
    let mathBuf   = '';

    const flushMath = (delim) => {
      out += this._balanceMathContent(mathBuf) + delim;
      mathBuf = '';
    };

    while (pos < text.length) {
      if (text.startsWith('$$', pos)) {
        if (inDisplay) { flushMath('$$'); inDisplay = false; }
        else if (inInline) { flushMath('$'); inInline = false; out += '$$'; inDisplay = true; }
        else { out += '$$'; inDisplay = true; }
        pos += 2;
      } else if (text[pos] === '$') {
        if (inInline) { flushMath('$'); inInline = false; }
        else if (inDisplay) { flushMath('$$'); inDisplay = false; out += '$'; inInline = true; }
        else { out += '$'; inInline = true; }
        pos += 1;
      } else {
        if (inInline || inDisplay) mathBuf += text[pos];
        else out += text[pos];
        pos++;
      }
    }

    if (inInline)  { out += this._balanceMathContent(mathBuf) + '$'; }
    if (inDisplay) { out += this._balanceMathContent(mathBuf) + '$$'; }

    return out;
  }

  static _balanceMathContent(mathStr) {
    if (!mathStr) return mathStr;
    return balanceParens(balanceBraces(mathStr));
  }

  // ─── PRIVATE: ESCAPED PAIR BALANCER ─────────────────────────────────────────

  static _balanceEscapedPairs(s, open, close) {
    let result = '';
    let inMath = false;
    let pos    = 0;

    while (pos < s.length) {
      if (s.startsWith(open, pos)) {
        if (inMath) result += close;  // unclosed prev block
        result += open;
        inMath = true;
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
    if (inMath) result += close;
    return result;
  }

  /**
   * Extract LaTeX content for a specific chunk (identity — future: span matching).
   */
  static extractChunkLatex(latex, chunk) {
    if (!latex || !chunk) return chunk;
    return latex;
  }
}

module.exports = { LatexNormalizer, LatexSanitizer: LatexNormalizer };
