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

    const rawLines = source?.ocr?.lines || source?.lines;
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

    const cleanText = cleanLines.join('\n');

    return {
      cleanText,
      columnLayout: '1-col',
      columnCount: 1,
      diagramRegions,
      strippedLines,
      layoutMetadata: {
        strategy:       'text-only',
        totalLines:     lines.length,
        cleanLineCount: cleanLines.length,
        strippedCount:  strippedLines.length,
        hasDiagrams:    diagramRegions.length > 0,
      },
    };
  }
}

module.exports = { PageLayoutAnalyzer };
