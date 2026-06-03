/**
 * ColumnMatchingParser
 *
 * PURPOSE:
 *   Parse column-matching / table-type questions into structured data.
 *   DO NOT flatten column tables into MCQ options.
 *   DO NOT send table content into the MCQ parser.
 *
 * INPUT:
 *   A single segment of text classified as TABLE type.
 *
 * OUTPUT:
 *   {
 *     question: string,         // Preamble / instruction text before the table
 *     columnA: ColumnEntry[],   // Left-column entries
 *     columnB: ColumnEntry[],   // Right-column entries
 *     options: [],              // Empty or matching-choice options if present
 *     matchingChoices: string[] // e.g. ["(i)-(a)", "(ii)-(c)"]
 *     format: 'column_matching',
 *     parserConfidence: number,
 *   }
 *
 * ColumnEntry: { label: string, text: string }
 */

'use strict';

// ─── PATTERNS ─────────────────────────────────────────────────────────────────

// LaTeX tabular/array environment
const LATEX_TABLE_RE = /\\begin\{(?:tabular|array)\}([\s\S]*?)\\end\{(?:tabular|array)\}/i;

// Column A / Column B heading line
const COLUMN_HEADER_RE = /(?:column|স্তম্ভ|स्तंभ)\s*[A-Bab১২]\s*(?:\||\t|  +).*(?:column|স্তম্ভ|स्तंभ)\s*[A-Bab১২]/i;

// Pipe-separated table row: | cell | cell |
const PIPE_ROW_RE = /^\|(.+)\|$/;

// Common column-A label patterns: (i), i., [i], 1., [1]
const COL_A_LABEL_RE = /^(?:\((?:i{1,4}|[1-4ivx]+)\)|(?:i{1,4}|[1-4ivx]+)[\.\)]|\[(?:i{1,4}|[1-4ivx]+)\])\s+/i;

// Common column-B label patterns: (a)-(d), a., [a]
const COL_B_LABEL_RE = /^(?:\(([a-dA-D])\)|([a-dA-D])[\.\)]|\[([a-dA-D])\])\s+/;

// Inline matching pattern: [i]–[a], (i)-(d)
const INLINE_MATCH_RE = /[\[\(]([ivxIVX1-4]{1,4})[\]\)]\s*[-–—]\s*[\[\(]([a-dA-D]{1,2})[\]\)]/g;

class ColumnMatchingParser {

  /**
   * Parse a column-matching segment.
   *
   * @param {string} segmentText
   * @returns {ColumnMatchResult}
   */
  static parse(segmentText) {
    if (!segmentText || !segmentText.trim()) {
      return this._empty();
    }

    const text = segmentText.trim();

    // ── Try LaTeX tabular ──────────────────────────────────────────────────
    const latexResult = this._parseLatexTabular(text);
    if (latexResult) return latexResult;

    // ── Try pipe-separated table ──────────────────────────────────────────
    const pipeResult = this._parsePipeTable(text);
    if (pipeResult) return pipeResult;

    // ── Try inline column matching ────────────────────────────────────────
    const inlineResult = this._parseInlineColumns(text);
    if (inlineResult) return inlineResult;

    // ── Fallback: preserve text as-is, mark as table ──────────────────────
    return {
      question: text,
      columnA: [],
      columnB: [],
      options: [],
      matchingChoices: this._extractMatchingChoices(text),
      format: 'column_matching',
      parserConfidence: 0.50,
      diagnostics: { strategy: 'fallback', rawInput: segmentText },
    };
  }

  // ─── STRATEGIES ────────────────────────────────────────────────────────────

  static _parseLatexTabular(text) {
    const m = text.match(LATEX_TABLE_RE);
    if (!m) return null;

    const tableBody = m[1];
    const preTable  = text.substring(0, text.indexOf('\\begin{')).trim();
    const rows      = tableBody.split(/\\\\/g).map(r => r.trim()).filter(Boolean);

    const columnA = [];
    const columnB = [];

    for (const row of rows) {
      if (/^\\hline/.test(row)) continue;
      const cells = row.split('&').map(c => c.replace(/\\hline/g, '').trim());
      if (cells.length >= 2) {
        columnA.push({ label: this._extractLabel(cells[0]), text: cells[0] });
        columnB.push({ label: this._extractLabel(cells[1]), text: cells[1] });
      }
    }

    if (columnA.length === 0) return null;

    return {
      question: preTable || 'Match the following:',
      columnA,
      columnB,
      options: [],
      matchingChoices: [],
      format: 'column_matching',
      parserConfidence: 0.92,
      diagnostics: { strategy: 'latex_tabular' },
    };
  }

  static _parsePipeTable(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const tableRows = lines.filter(l => PIPE_ROW_RE.test(l));
    if (tableRows.length < 2) return null;

    const columnA = [];
    const columnB = [];
    let headerSkipped = false;

    for (const row of tableRows) {
      const cells = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length < 2) continue;

      // Skip separator rows: | --- | --- |
      if (/^[-:]+$/.test(cells[0])) continue;

      // Skip column header row (Column A / Column B)
      if (!headerSkipped && (COLUMN_HEADER_RE.test(row) || /^(?:column|স্তম্ভ)/i.test(cells[0]))) {
        headerSkipped = true;
        continue;
      }

      columnA.push({ label: this._extractLabel(cells[0]), text: cells[0] });
      columnB.push({ label: this._extractLabel(cells[1] || ''), text: cells[1] || '' });
    }

    if (columnA.length === 0) return null;

    const preamble = lines.filter(l => !PIPE_ROW_RE.test(l)).join(' ').trim();

    return {
      question: preamble || 'Match the following:',
      columnA,
      columnB,
      options: [],
      matchingChoices: this._extractMatchingChoices(text),
      format: 'column_matching',
      parserConfidence: 0.88,
      diagnostics: { strategy: 'pipe_table', rowCount: tableRows.length },
    };
  }

  static _parseInlineColumns(text) {
    // Look for two parallel numbered lists
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    const colALines = lines.filter(l => COL_A_LABEL_RE.test(l));
    const colBLines = lines.filter(l => COL_B_LABEL_RE.test(l));

    if (colALines.length === 0 && colBLines.length === 0) return null;

    const columnA = colALines.map(l => ({
      label: (l.match(COL_A_LABEL_RE) || [''])[0].trim(),
      text: l.replace(COL_A_LABEL_RE, '').trim(),
    }));
    const columnB = colBLines.map(l => ({
      label: (l.match(COL_B_LABEL_RE) || [''])[0].trim(),
      text: l.replace(COL_B_LABEL_RE, '').trim(),
    }));

    const preamble = lines
      .filter(l => !COL_A_LABEL_RE.test(l) && !COL_B_LABEL_RE.test(l))
      .join(' ')
      .trim();

    return {
      question: preamble || 'Match the following:',
      columnA,
      columnB,
      options: [],
      matchingChoices: this._extractMatchingChoices(text),
      format: 'column_matching',
      parserConfidence: 0.78,
      diagnostics: { strategy: 'inline_columns' },
    };
  }

  // ─── UTILITIES ────────────────────────────────────────────────────────────

  /**
   * Extract a label (i, ii, a, b, …) from a cell string.
   */
  static _extractLabel(cellText) {
    const m = cellText.match(/^(?:\(([a-zA-Zivx]{1,4})\)|([a-zA-Zivx]{1,4})[\.\)]|\[([a-zA-Zivx]{1,4})\])\s*/i);
    if (m) return (m[1] || m[2] || m[3] || '').trim();
    return '';
  }

  /**
   * Extract any inline matching choices already present in the text.
   * e.g. (i)-(a), [ii]-[c]
   */
  static _extractMatchingChoices(text) {
    const choices = [];
    let m;
    const re = new RegExp(INLINE_MATCH_RE.source, 'gi');
    while ((m = re.exec(text)) !== null) {
      choices.push(`(${m[1]})-(${m[2]})`);
    }
    return choices;
  }

  static _empty() {
    return {
      question: '',
      columnA: [],
      columnB: [],
      options: [],
      matchingChoices: [],
      format: 'column_matching',
      parserConfidence: 0,
      diagnostics: { rawInput: '' },
    };
  }
}

module.exports = { ColumnMatchingParser };
