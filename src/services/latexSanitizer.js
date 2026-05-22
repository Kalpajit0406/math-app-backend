/**
 * LatexSanitizer Service
 * Cleans up LaTeX markup issues from OCR recognition, balancing delimiters, brackets, and blocks.
 */
class LatexSanitizer {
  /**
   * Sanitize entire LaTeX block
   * @param {string} latex
   * @returns {string}
   */
  static sanitize(latex) {
    if (!latex) return '';
    let s = latex;

    // Convert display block math delimiters to unified $$ format
    s = s.replace(/\\\[/g, '$$').replace(/\\\]/g, '$$');
    s = s.replace(/\\\(/g, '$').replace(/\\\)/g, '$');

    // Remove OCR spacing artifacts in commands
    s = s.replace(/\\\s+/g, '\\');
    s = s.replace(/}\s*\\left/g, '}\\left');
    s = s.replace(/\$\s+/g, '$');
    s = s.replace(/\s+\$/g, '$');

    // Remove dangerous LaTeX commands to prevent execution / injection vectors
    const dangerous = [
      'input', 'write', 'immediate', 'openout', 'closeout', 'special',
      'usepackage', 'documentclass', 'def', 'let', 'catcode', 'edef', 
      'xdef', 'expandafter'
    ];
    for (const cmd of dangerous) {
      s = s.replace(new RegExp(`\\\\${cmd}\\s*{[^}]*}`, 'g'), '');
    }

    // Balance common KaTeX environments
    for (const env of ['matrix', 'pmatrix', 'bmatrix', 'align', 'cases', 'array', 'equation']) {
      const opens = (s.match(new RegExp(`\\\\begin{${env}}`, 'g')) || []).length;
      const closes = (s.match(new RegExp(`\\\\end{${env}}`, 'g')) || []).length;
      if (opens > closes) s += ` \\end{${env}}`.repeat(opens - closes);
    }

    // Balance braces and dollar signs
    s = this._balanceBraces(s);
    s = this._balanceDollarSigns(s);

    // Normalize common OCR symbol mistakes to standard math tokens
    const symbolMap = {
      '−': '-', // unicode minus
      '×': '\\times',
      '÷': '\\div',
      '·': '\\cdot',
      '—': '-',
      '–': '-'
    };
    s = s.replace(/[−×÷·—–]/g, ch => symbolMap[ch] || ch);

    // Repair simple frac patterns where OCR may drop braces: e.g. \frac a b -> \frac{a}{b}
    s = s.replace(/\\?frac\s*\{?\s*([^\s{}]+)\s*\}?\s*\{?\s*([^\s{}]+)\s*\}?/g, '\\frac{$1}{$2}');

    // Remove duplicated operators like ++ or -- introduced by OCR
    s = s.replace(/([+\-\/\^=])\1+/g, '$1');

    // Balance parentheses and square brackets
    s = this._balanceBrackets(s);

    // Fix common OCR fraction/power spacing errors
    s = s.replace(/\^(\d)([a-zA-Z])/g, '^{$1}$2');
    s = s.replace(/_(\d)([a-zA-Z])/g, '_{$1}$2');

    return s.trim();
  }

  /**
   * Balance braces in text
   * @param {string} s
   * @returns {string}
   */
  static _balanceBraces(s) {
    let opens = 0, closes = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '{' && (i === 0 || s[i - 1] !== '\\')) opens++;
      else if (s[i] === '}' && (i === 0 || s[i - 1] !== '\\')) closes++;
    }
    if (opens > closes) return s + '}'.repeat(Math.min(opens - closes, 10));
    return s;
  }

  /**
   * Balance brackets and parentheses
   * @param {string} s
   * @returns {string}
   */
  static _balanceBrackets(s) {
    let openPar = 0, closePar = 0, openSq = 0, closeSq = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '(' && (i === 0 || s[i - 1] !== '\\')) openPar++;
      else if (s[i] === ')' && (i === 0 || s[i - 1] !== '\\')) closePar++;
      else if (s[i] === '[' && (i === 0 || s[i - 1] !== '\\')) openSq++;
      else if (s[i] === ']' && (i === 0 || s[i - 1] !== '\\')) closeSq++;
    }
    if (openPar > closePar) s = s + ')'.repeat(Math.min(openPar - closePar, 10));
    if (openSq > closeSq) s = s + ']'.repeat(Math.min(openSq - closeSq, 10));
    return s;
  }

  /**
   * Balance dollar signs (inline math delimiters)
   * @param {string} s
   * @returns {string}
   */
  static _balanceDollarSigns(s) {
    let dollars = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '$' && (i === 0 || s[i - 1] !== '\\')) dollars++;
    }
    if (dollars % 2 !== 0) return s + '$';
    return s;
  }

  /**
   * Extract and preserve LaTeX for a specific question chunk
   * @param {string} latex
   * @param {string} chunk
   * @returns {string}
   */
  static extractChunkLatex(latex, chunk) {
    if (!latex || !chunk) return chunk;
    return latex;
  }
}

module.exports = { LatexSanitizer };
