/**
 * PageLayoutAnalyzer — Phase 1: Pre-OCR / Post-OCR Structural Analysis
 *
 * RESPONSIBILITIES:
 *   1. Detect page column layout  (1-col / 2-col / multi-col)
 *   2. Identify question-body regions vs header/footer/decoration bands
 *   3. Isolate diagram bounding boxes
 *   4. Strip: headers, footers, page numbers, QR codes, borders,
 *             publisher branding, decorative graphics, difficulty stars
 *   5. Reconstruct clean text IN READING ORDER from bounding-box data
 *
 * INPUT:  Full Mathpix JSON result  (has .lines / .ocr.lines with bbox data)
 *         OR raw OCR text when no geometry data is present.
 *
 * OUTPUT:
 *   {
 *     cleanText       : string,          // text ready for parsing
 *     columnLayout    : '1-col'|'2-col'|'multi-col',
 *     regionMap       : RegionMap[],     // labelled page regions
 *     diagramRegions  : DiagramInfo[],   // bounding boxes of detected diagrams
 *     strippedLines   : string[],        // lines removed by noise filter
 *     layoutMetadata  : object,
 *   }
 */

'use strict';

// ─── NOISE / JUNK LINE PATTERNS ───────────────────────────────────────────────
// These patterns match content that must NEVER enter question text.
const NOISE_PATTERNS = [
  // Page numbers
  /^page\s*\d+\s*$/i,
  /^\d+\s*\/\s*\d+\s*$/,        // "3/12"
  /^\d+\s*of\s*\d+\s*$/i,       // "3 of 12"
  /^\d{1,3}\s*$/,                // lone small integer (likely page number)

  // School / exam metadata
  /(?:higher\s*secondary|madhyamik|board\s*exam|class\s*xi{1,2}|class\s*x{1,2}\b|wbchse|wbbse|icse|cbse|hs\s*(?:corner|examination)|madhyamik\s*pariksha)/i,
  /(?:exam\s*(?:year|20\d\d)|model\s*test|mock\s*test|annual\s*exam|(?:first|second|third|final)\s*(?:term|unit)\s*exam)/i,

  // Publisher / branding
  /(?:chhaya|saraswati|ncert|pearson|s\.chand|s chand|publisher|publication|printed\s*by|all\s*rights\s*reserved)/i,

  // Answer key references
  /(?:answer\s*(?:key|sheet|on\s*page)|see\s*answer|উত্তরমালা\s*দেখুন)/i,

  // QR code labels
  /(?:scan\s*(?:this\s*)?qr|qr\s*code|scan\s*for\s*(?:answer|solution))/i,

  // Footer / header patterns
  /(?:downloaded\s*from|prepared\s*by|www\.|https?:\/\/|copyright\s*©|©\s*\d{4})/i,
  /(?:visit\s*(?:us\s*)?(?:at|on)\s*(?:www|http)|official\s*website)/i,

  // Decorative / star lines
  /^[★✦✧•\-=_*~|\\\/]{3,}\s*$/,

  // Bengali metadata
  /(?:প্রকাশক|মুদ্রণ|সর্বস্বত্ব|শ্রেণি\s*:?\s*[০-৯xi]+|পাঠ্যক্রম|পরীক্ষার্থী)/i,

  // Difficulty / marking indicators
  /^(?:\*{1,5}|stars?)\s*(?:difficulty|level|mark)?\s*$/i,
  /^marks?\s*[:：]?\s*\d+\s*$/i,
  /^(?:easy|medium|hard|difficult)\s*$/i,

  // Border / decoration lines
  /^[╔╗╚╝╠╣╦╩╬│─┼]+\s*$/,
];

// Lines kept even if they LOOK like noise (they carry semantic meaning for questions)
const NOISE_WHITELIST_RE = /[ক-হঅ-ঔa-zA-Z]{4,}.*\?/;  // Bengali/English question

// Diagram detection: lines whose TEXT strongly indicates a diagram label
const DIAGRAM_LABEL_RE = /^(?:fig(?:ure)?\.?\s*\d*|diagram\s*\d*|graph\s*\d*|table\s*\d*|চিত্র\s*\d*|সারণি\s*\d*|রেখাচিত্র\s*\d*)\.?\s*$/i;

// Header / footer position thresholds (fraction of page height)
const HEADER_ZONE_FRAC = 0.07;  // top 7%
const FOOTER_ZONE_FRAC = 0.93;  // bottom 7%

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function isNoisy(line) {
  const t = line.trim();
  if (!t) return true;
  if (NOISE_WHITELIST_RE.test(t)) return false;
  return NOISE_PATTERNS.some(p => p.test(t));
}

function isPositionalNoise(lineObj, pageH) {
  if (!pageH || pageH === 0) return false;
  const relY = lineObj.midY / pageH;
  return relY < HEADER_ZONE_FRAC || relY > FOOTER_ZONE_FRAC;
}

function buildLineObj(raw, idx) {
  const text = (raw.text || '').trim();
  let box = raw.bbox || raw.rect || raw.rect_pix;
  let x = 0, y = 0, w = 0, h = 0;
  if (Array.isArray(box)) {
    [x, y, w, h] = box;
  } else if (box && typeof box === 'object') {
    x = box.left ?? box.x ?? 0;
    y = box.top  ?? box.y ?? 0;
    w = box.width ?? box.w ?? 0;
    h = box.height ?? box.h ?? 0;
  } else if (Array.isArray(raw.cnt) && raw.cnt.length > 0) {
    // Mathpix's include_line_data / lines_json format gives a 4-point
    // contour polygon ("cnt": [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]) instead of
    // an axis-aligned box — derive the bounding box from its corner points.
    const xs = raw.cnt.map(p => p[0]);
    const ys = raw.cnt.map(p => p[1]);
    x = Math.min(...xs);
    y = Math.min(...ys);
    w = Math.max(...xs) - x;
    h = Math.max(...ys) - y;
  }
  return { id: idx, text, x, y, w, h, right: x + w, bottom: y + h, midX: x + w / 2, midY: y + h / 2 };
}

// ─── COLUMN DETECTION ─────────────────────────────────────────────────────────

function detectColumns(lineObjs) {
  if (lineObjs.length < 4) return [{ id: 0, lines: lineObjs }];

  // Project all line x-ranges onto a horizontal histogram
  // Lines in different columns have non-overlapping x-ranges
  const sortedByX = [...lineObjs].sort((a, b) => a.x - b.x);

  const cols = [];
  let cur = { minX: sortedByX[0].x, maxX: sortedByX[0].right, lines: [sortedByX[0]] };

  for (let i = 1; i < sortedByX.length; i++) {
    const line = sortedByX[i];
    // Gap between current column's right edge and this line's left edge
    const gap = line.x - cur.maxX;
    // Typical column gap is > 5% of page width (rough heuristic)
    if (gap > cur.maxX * 0.08 && line.x > cur.maxX) {
      cols.push(cur);
      cur = { minX: line.x, maxX: line.right, lines: [line] };
    } else {
      cur.minX = Math.min(cur.minX, line.x);
      cur.maxX = Math.max(cur.maxX, line.right);
      cur.lines.push(line);
    }
  }
  cols.push(cur);

  // Filter trivially small columns (noise margin text)
  const minLines = Math.max(3, lineObjs.length * 0.04);
  const valid = cols.filter(c => c.lines.length >= minLines);
  if (valid.length === 0) return [{ id: 0, lines: lineObjs }];
  return valid.map((c, idx) => ({ id: idx, lines: c.lines }));
}

// ─── DIAGRAM REGION DETECTION ─────────────────────────────────────────────────

function detectDiagramRegions(lineObjs) {
  const diagrams = [];
  for (const lo of lineObjs) {
    if (DIAGRAM_LABEL_RE.test(lo.text)) {
      diagrams.push({
        label: lo.text,
        boundingBox: { x: lo.x, y: lo.y, w: lo.w, h: lo.h },
        lineId: lo.id,
      });
    }
  }
  return diagrams;
}

// ─── PARAGRAPH GROUPING ───────────────────────────────────────────────────────

function groupIntoParagraphs(sortedLines) {
  if (sortedLines.length === 0) return [];
  const paragraphs = [];
  let cur = { lines: [sortedLines[0]], text: sortedLines[0].text };

  for (let i = 1; i < sortedLines.length; i++) {
    const prev = sortedLines[i - 1];
    const line = sortedLines[i];
    const gap = line.y - prev.bottom;
    const avgH = (prev.h + line.h) / 2;
    const isNewBlock = gap > avgH * 1.5 ||
      // Standard: "1." "2)" "Q1." "প্রশ্ন 1"
      /^(?:Question|Q|No|প্রশ্ন|প্র)?\s*\d{1,3}[\.):]/.test(line.text) ||
      // Real WB book format: "›)1" ">)1" "»)1" or just ")1"
      /^[›»>)\u203a]\)?\s*\d{1,3}[\s\.):\-]?/.test(line.text) ||
      /^[›»>)\u203a]\)?\s*[০-৯]{1,3}[\s\.):\-]?/.test(line.text) ||
      /^[\(\[]?\s*[A-Da-dকখগঘ১২৩৪]\s*[\)\]\.\:]/.test(line.text);

    if (isNewBlock) {
      paragraphs.push(cur);
      cur = { lines: [line], text: line.text };
    } else {
      cur.lines.push(line);
      const joiner = (line.text.startsWith('$') || prev.text.endsWith('$')) ? ' ' : '\n';
      cur.text += joiner + line.text;
    }
  }
  paragraphs.push(cur);
  return paragraphs;
}

// ─── MAIN CLASS ───────────────────────────────────────────────────────────────

class PageLayoutAnalyzer {

  /**
   * Analyze page layout from full Mathpix result OR raw text.
   *
   * @param {object|string} source - Mathpix JSON result OR raw OCR text string
   * @returns {LayoutAnalysis}
   */
  static analyze(source) {
    // ── Handle pure text input (no bounding boxes) ──────────────────────────
    if (typeof source === 'string') {
      return this._analyzeTextOnly(source);
    }

    const rawLines = source?.ocr?.lines || source?.lines || source?.jsonLines || source?.line_data;
    const rawText  = source?.latex || source?.rawText || source?.text || '';

    if (!Array.isArray(rawLines) || rawLines.length === 0) {
      return this._analyzeTextOnly(rawText);
    }

    // ── Build line objects with geometry ────────────────────────────────────
    const allLineObjs = rawLines
      .map(buildLineObj)
      .filter(lo => lo.text.length > 0);

    if (allLineObjs.length === 0) {
      return this._analyzeTextOnly(rawText);
    }

    // ── Estimate page dimensions ─────────────────────────────────────────────
    const pageH = Math.max(...allLineObjs.map(lo => lo.bottom));

    // ── Classify each line ────────────────────────────────────────────────────
    const cleanLines    = [];
    const strippedLines = [];

    for (const lo of allLineObjs) {
      const positionalNoise = isPositionalNoise(lo, pageH);
      const contentNoise    = isNoisy(lo.text);

      if (positionalNoise || contentNoise) {
        strippedLines.push(lo.text);
      } else {
        cleanLines.push(lo);
      }
    }

    // ── Detect diagrams ───────────────────────────────────────────────────────
    const diagramRegions = detectDiagramRegions(cleanLines);

    // ── Column detection ──────────────────────────────────────────────────────
    const columns     = detectColumns(cleanLines);
    const columnCount = columns.length;
    const columnLayout = columnCount >= 3 ? 'multi-col' : columnCount === 2 ? '2-col' : '1-col';

    // ── Sort into reading order ───────────────────────────────────────────────
    let sortedLines = [];
    if (columnCount > 1) {
      const sortedCols = [...columns].sort((a, b) => {
        const aMinX = Math.min(...a.lines.map(l => l.x));
        const bMinX = Math.min(...b.lines.map(l => l.x));
        return aMinX - bMinX;
      });
      for (const col of sortedCols) {
        sortedLines.push(...col.lines.sort((a, b) => a.y - b.y));
      }
    } else {
      sortedLines = [...cleanLines].sort((a, b) => a.midY - b.midY);
    }

    // ── Group into paragraphs and reconstruct text ───────────────────────────
    const paragraphs = groupIntoParagraphs(sortedLines);
    const cleanText  = paragraphs.map(p => p.text).join('\n\n');

    return {
      cleanText,
      columnLayout,
      columnCount,
      diagramRegions,
      strippedLines,
      layoutMetadata: {
        strategy:       'geometry-aware',
        columnCount,
        columnLayout,
        totalLines:     allLineObjs.length,
        cleanLineCount: cleanLines.length,
        strippedCount:  strippedLines.length,
        paragraphCount: paragraphs.length,
        hasDiagrams:    diagramRegions.length > 0,
        pageHeight:     pageH,
      },
    };
  }

  // ─── TEXT-ONLY FALLBACK ───────────────────────────────────────────────────

  static _analyzeTextOnly(text) {
    if (!text || !text.trim()) {
      return {
        cleanText: '',
        columnLayout: '1-col',
        columnCount: 1,
        diagramRegions: [],
        strippedLines: [],
        layoutMetadata: { strategy: 'text-only-empty' },
      };
    }

    const lines = text.split('\n');
    const cleanLines    = [];
    const strippedLines = [];

    for (const line of lines) {
      if (isNoisy(line)) {
        strippedLines.push(line.trim());
      } else {
        cleanLines.push(line);
      }
    }

    // Detect diagram labels in text
    const diagramRegions = cleanLines
      .filter(l => DIAGRAM_LABEL_RE.test(l.trim()))
      .map(l => ({ label: l.trim(), boundingBox: null, lineId: null }));

    // ── Text-based 2-column heuristic ────────────────────────────────────────
    // When Mathpix OCRs a 2-column page without geometry data, it reads across
    // columns interleaving left & right lines. This shows up as question numbers
    // that jump forward by a large amount then come back (e.g. 1,2,10,3,11,4,12...).
    // We detect this and re-split into [left-col lines] + [right-col lines].
    const columnLayout = this._detectTextColumnLayout(cleanLines);
    let cleanText;
    if (columnLayout === '2-col') {
      cleanText = this._reconstructTwoColumnText(cleanLines);
    } else {
      cleanText = cleanLines.join('\n');
    }

    return {
      cleanText,
      columnLayout,
      columnCount: columnLayout === '2-col' ? 2 : 1,
      diagramRegions,
      strippedLines,
      layoutMetadata: {
        strategy:       'text-only',
        columnLayout,
        totalLines:     lines.length,
        cleanLineCount: cleanLines.length,
        strippedCount:  strippedLines.length,
        hasDiagrams:    diagramRegions.length > 0,
      },
    };
  }

  // Question-number header pattern shared by detection + reconstruction.
  static _Q_NUM_RE = /^(?:[›»>)]\)?|(?:Question|Q\.?)\s*)?\s*(\d{1,3})[.):\s]/;

  /**
   * Locate all question-header lines and figure out, if possible, how to
   * split them into a left-column run and a right-column run. Two distinct
   * OCR failure shapes are handled:
   *
   *   1. STRICT ALTERNATION — the OCR reads the page row-by-row across the
   *      full width, so headers from a same-height left/right column pair
   *      land back-to-back: 37,45,38,46,39,47,... Splitting by even/odd
   *      position in the header list recovers both columns natural order.
   *   2. SINGLE CLEAN BREAK — the OCR emits the whole left column as one
   *      block, then the whole right column as one block: 37,38,...,44,
   *      45,46,...,52. There is exactly one large forward jump.
   *
   * Returns null when neither shape is detected (page is genuinely 1-column,
   * or the pattern is too irregular to safely reorder) — callers must then
   * leave the text untouched rather than risk scrambling it further.
   */
  static _findColumnSplit(lines) {
    const headers = [];
    lines.forEach((line, idx) => {
      const m = line.trim().match(this._Q_NUM_RE);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n >= 1 && n <= 500) headers.push({ idx, num: n });
      }
    });

    if (headers.length < 4) return null;

    // A run is "monotonic" if it only increases, allowing exactly the kind
    // of restart-to-1 that marks a new section (e.g. "Fill in the Blanks").
    const isMonotonic = (arr) => arr.every((h, i) => i === 0 || h.num > arr[i - 1].num || h.num === 1);

    // If the page is ALREADY in correct reading order (a plain increasing
    // run, or a single legitimate restart-to-1 for a new section), there is
    // nothing to fix — do NOT reorder it. This matters because any sequence
    // that is already monotonic trivially "passes" an even/odd split too
    // (sub-sequences of a monotonic sequence are always monotonic), so we
    // must rule this out first or we'd scramble perfectly correct text.
    if (isMonotonic(headers)) return null;

    const evens = headers.filter((_, i) => i % 2 === 0);
    const odds  = headers.filter((_, i) => i % 2 === 1);
    if (odds.length >= 2 && isMonotonic(evens) && isMonotonic(odds)) {
      return { headers, colOfHeaderIdx: headers.map((_, i) => i % 2), shape: 'alternating' };
    }

    // SINGLE REVERSED BLOCK — the OCR emitted the right column's block
    // before the left column's (e.g. 45,46,...,52,37,38,...,44). Find the
    // one point where the number drops backward (not a restart-to-1) and
    // confirm both sides are individually monotonic; the block that starts
    // lower is the true left column and belongs first.
    for (let i = 1; i < headers.length; i++) {
      if (headers[i].num < headers[i - 1].num && headers[i].num !== 1) {
        const before = headers.slice(0, i);
        const after  = headers.slice(i);
        if (isMonotonic(before) && isMonotonic(after)) {
          const beforeFirst = before[0].num <= after[0].num;
          return {
            headers,
            colOfHeaderIdx: headers.map((_, idx2) => {
              const inBefore = idx2 < i;
              return beforeFirst ? (inBefore ? 0 : 1) : (inBefore ? 1 : 0);
            }),
            shape: 'reversed-block',
          };
        }
        break; // irregular pattern beyond a single clean reversal — bail out
      }
    }

    return null;
  }

  /**
   * Detect if a text-only page is likely 2-column by analysing
   * question number sequences (no bounding-box geometry available).
   */
  static _detectTextColumnLayout(lines) {
    const split = this._findColumnSplit(lines);
    if (split) {
      console.log(`[PageLayoutAnalyzer] Text-heuristic: 2-col detected (${split.shape})`);
      return "2-col";
    }
    return "1-col";
  }

  /**
   * Reconstruct reading order for a 2-column text page: every line is
   * assigned to the column of the most recent header before it, then
   * column 0 (left) is emitted in full followed by column 1 (right).
   */
  static _reconstructTwoColumnText(lines) {
    const split = this._findColumnSplit(lines);
    if (!split) return lines.join('\n');

    const { headers, colOfHeaderIdx } = split;
    const columns = [[], []];
    let currentCol = 0;
    let hIdx = 0;

    for (let i = 0; i < lines.length; i++) {
      if (hIdx < headers.length && headers[hIdx].idx === i) {
        currentCol = colOfHeaderIdx[hIdx];
        hIdx++;
      }
      columns[currentCol].push(lines[i]);
    }

    console.log(`[PageLayoutAnalyzer] 2-col reconstruction: left=${columns[0].length} lines, right=${columns[1].length} lines`);
    return columns[0].join('\n') + '\n\n' + columns[1].join('\n');
  }
}

module.exports = { PageLayoutAnalyzer };
