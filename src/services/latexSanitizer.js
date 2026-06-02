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

    // Collapse multiple escaped underscores into a single blank line pattern (\_____)
    s = s.replace(/(?:\\_)+/g, (match) => '\\' + '_'.repeat(match.length / 2));

    // Remove OCR spacing artifacts in commands first (collapses `\ (` to `\` and `\ )` to `\)`)
    s = s.replace(/\\\s+/g, '\\');

    // Balance unclosed LaTeX delimiters first
    s = this._balanceEscapedParentheses(s);
    s = this._balanceEscapedBrackets(s);

    // Strip spaces inside LaTeX delimiters BEFORE converting to $
    s = s.replace(/\\\(\s+/g, '\\(');
    s = s.replace(/\s+\\\)/g, '\\)');
    s = s.replace(/\\\[\s+/g, '\\[');
    s = s.replace(/\s+\\\]/g, '\\]');

    // Convert display block math delimiters to unified $$ format
    s = s.replace(/\\\[/g, '$$').replace(/\\\]/g, '$$');
    s = s.replace(/\\\(/g, '$').replace(/\\\)/g, '$');

    s = s.replace(/}\s*\\left/g, '}\\left');

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

  static _balanceEscapedParentheses(s) {
    let result = '';
    let inMath = false;
    let pos = 0;
    let currentMathStart = -1;

    while (pos < s.length) {
      if (s.startsWith('\\(', pos)) {
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
            result = result.substring(0, transitionIndex) + '\\)' + result.substring(transitionIndex);
            inMath = false;
          } else if (trailingSpaceMatch) {
            const spaceIndex = result.length - trailingSpaceMatch[0].length;
            result = result.substring(0, spaceIndex) + '\\)' + result.substring(spaceIndex);
            inMath = false;
          } else {
            result += '\\)';
            inMath = false;
          }
        }
        result += '\\(';
        inMath = true;
        currentMathStart = result.length;
        pos += 2;
      } else if (s.startsWith('\\)', pos)) {
        result += '\\)';
        inMath = false;
        pos += 2;
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
        result = result.substring(0, spaceIndex) + '\\)' + result.substring(spaceIndex);
      } else {
        result += '\\)';
      }
    }
    return result;
  }

  static _balanceEscapedBrackets(s) {
    let result = '';
    let inMath = false;
    let pos = 0;
    let currentMathStart = -1;

    while (pos < s.length) {
      if (s.startsWith('\\[', pos)) {
        if (inMath) {
          const blockText = result.substring(currentMathStart);
          
          // 1. Check for transition words
          const transitionRegex = /(\s+(?:where|and|or|if|be|let|then|for|is|of|to|in|at|by|with|but|as|the|an|a)\s+)([^]*)$/i;
          const match = blockText.match(transitionRegex);
          
          // 2. Check for trailing spaces
          const trailingSpaceMatch = blockText.match(/\s+$/);
          
          if (match) {
            const transitionIndex = currentMathStart + match.index;
            result = result.substring(0, transitionIndex) + '\\]' + result.substring(transitionIndex);
            inMath = false;
          } else if (trailingSpaceMatch) {
            const spaceIndex = result.length - trailingSpaceMatch[0].length;
            result = result.substring(0, spaceIndex) + '\\]' + result.substring(spaceIndex);
            inMath = false;
          } else {
            result += '\\]';
            inMath = false;
          }
        }
        result += '\\[';
        inMath = true;
        currentMathStart = result.length;
        pos += 2;
      } else if (s.startsWith('\\]', pos)) {
        result += '\\]';
        inMath = false;
        pos += 2;
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
        result = result.substring(0, spaceIndex) + '\\]' + result.substring(spaceIndex);
      } else {
        result += '\\]';
      }
    }
    return result;
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
