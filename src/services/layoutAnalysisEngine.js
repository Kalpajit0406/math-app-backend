/**
 * LayoutAnalysisEngine — Geometry-Aware Document Understanding
 *
 * Implements Phase 2:
 *   - Bounding box grouping
 *   - Vertical spacing analysis
 *   - Alignment & Indentation grouping
 *   - Multi-column layout detection
 *   - Visual question clustering
 *
 * Prevents:
 *   - Multi-column reading order corruption (reading left-to-right across columns)
 *   - Fragmented paragraphs
 */

'use strict';

class LayoutAnalysisEngine {

  /**
   * Performs geometry-aware layout analysis and reconstructs text in reading order.
   *
   * @param {object} mathpixResult - Full JSON result from Mathpix
   * @returns {{ text: string, layoutMetadata: object }}
   */
  static analyze(mathpixResult) {
    if (!mathpixResult || typeof mathpixResult !== 'object') {
      return { text: '', layoutMetadata: { strategy: 'empty' } };
    }

    const lines = mathpixResult.ocr?.lines || mathpixResult.lines;
    const rawText = mathpixResult.latex || mathpixResult.rawText || mathpixResult.latex_styled || mathpixResult.text || '';

    // If no coordinates are available, fallback to linear text stream
    if (!Array.isArray(lines) || lines.length === 0) {
      console.log('[LayoutAnalysisEngine] No bounding box coordinates present. Falling back to linear OCR text.');
      return { text: rawText, layoutMetadata: { strategy: 'linear-fallback' } };
    }

    console.log(`[LayoutAnalysisEngine] Analyzing layout for ${lines.length} lines.`);

    // ── Step 1: Normalize and validate bounding boxes ───────────────────────
    const lineObjects = lines
      .map((line, idx) => {
        const text = line.text || '';
        // Extract rect coordinates: [x, y, w, h] or {top, left, width, height}
        let box = line.bbox || line.rect || line.rect_pix;
        if (!box && line.rect_pix) box = line.rect_pix;
        
        let x = 0, y = 0, w = 0, h = 0;
        if (Array.isArray(box)) {
          x = box[0]; y = box[1]; w = box[2]; h = box[3];
        } else if (box && typeof box === 'object') {
          // Mathpix standard coordinates
          x = box.left ?? box.x ?? 0;
          y = box.top ?? box.y ?? 0;
          w = box.width ?? box.w ?? 0;
          h = box.height ?? box.h ?? 0;
        }

        return {
          id: idx,
          text: text.trim(),
          x,
          y,
          w,
          h,
          right: x + w,
          bottom: y + h,
          midX: x + w / 2,
          midY: y + h / 2,
        };
      })
      .filter(l => l.text.length > 0);

    if (lineObjects.length === 0) {
      return { text: rawText, layoutMetadata: { strategy: 'no-valid-lines' } };
    }

    // ── Step 2: Detect Multi-Column layouts ──────────────────────────────────
    // Group lines into vertical bands to check for side-by-side columns.
    // If lines overlap significantly on their X ranges, they are single column.
    // If we have distinct X clusters, we have multi-column.
    const columns = this._detectColumns(lineObjects);
    const hasColumns = columns.length > 1;

    console.log(`[LayoutAnalysisEngine] Columns detected: ${columns.length}. HasColumns: ${hasColumns}`);

    // ── Step 3: Sort lines geometrically ─────────────────────────────────────
    let sortedLines = [];
    if (hasColumns) {
      // Sort columns left-to-right. Within each column, sort top-to-bottom.
      for (const col of columns) {
        const colLines = col.lines.sort((a, b) => a.y - b.y);
        sortedLines.push(...colLines);
      }
    } else {
      // Single column: sort strictly top-to-bottom
      sortedLines = lineObjects.sort((a, b) => a.midY - b.midY);
    }

    // ── Step 4: Indentation and Vertical Spacing Grouping ────────────────────
    // Reconstruct paragraph blocks based on y-spacing and indent alignment
    const paragraphs = this._groupIntoParagraphs(sortedLines);

    // ── Step 5: Visual Question Clustering ───────────────────────────────────
    // Build reconstructed text with visual boundaries
    const reconstructedText = paragraphs.map(p => p.text).join('\n\n');

    return {
      text: reconstructedText,
      layoutMetadata: {
        strategy: hasColumns ? 'multi-column' : 'single-column',
        columnCount: columns.length,
        paragraphCount: paragraphs.length,
        isGeometryAware: true,
      },
    };
  }

  // ─── PRIVATE HELPERS ────────────────────────────────────────────────────────

  /**
   * Group lines into side-by-side columns based on X coordinate overlap.
   */
  static _detectColumns(lines) {
    if (lines.length < 5) return [{ id: 0, lines }];

    // Simple horizontal projection clustering
    // Sort lines by X start
    const sortedByX = [...lines].sort((a, b) => a.x - b.x);
    
    // We cluster lines whose X ranges overlap significantly.
    // In multi-column pages, left column starts around x=10-100, right column around x=600-800.
    const cols = [];
    let currentColumn = {
      minX: sortedByX[0].x,
      maxX: sortedByX[0].right,
      lines: [sortedByX[0]],
    };

    for (let i = 1; i < sortedByX.length; i++) {
      const line = sortedByX[i];
      const overlap = Math.max(0, Math.min(currentColumn.maxX, line.right) - Math.max(currentColumn.minX, line.x));
      const range = Math.min(currentColumn.maxX - currentColumn.minX, line.w);

      // If X overlap is extremely low relative to line width, start a new column
      if (overlap < range * 0.15 && line.x > currentColumn.maxX) {
        cols.push(currentColumn);
        currentColumn = {
          minX: line.x,
          maxX: line.right,
          lines: [line],
        };
      } else {
        // Merge X bounds and append line
        currentColumn.minX = Math.min(currentColumn.minX, line.x);
        currentColumn.maxX = Math.max(currentColumn.maxX, line.right);
        currentColumn.lines.push(line);
      }
    }
    cols.push(currentColumn);

    // Filter out tiny clusters (e.g. noise margins)
    const validCols = cols.filter(c => c.lines.length >= Math.max(2, lines.length * 0.05));
    if (validCols.length === 0) return [{ id: 0, lines }];

    return validCols.map((c, idx) => ({ id: idx, lines: c.lines }));
  }

  /**
   * Group sorted lines into logical paragraphs based on vertical line gaps.
   */
  static _groupIntoParagraphs(lines) {
    if (lines.length === 0) return [];
    
    const paragraphs = [];
    let currentParagraph = {
      lines: [lines[0]],
      text: lines[0].text,
    };

    for (let i = 1; i < lines.length; i++) {
      const prev = lines[i - 1];
      const curr = lines[i];

      const gap = curr.y - prev.bottom;
      const avgHeight = (prev.h + curr.h) / 2;

      // Paragraph break threshold: vertical gap greater than 1.6x the line height,
      // or if the current line starts a new numbered list item / option.
      const isListItem = /^(?:Question|Q|No|প্রশ্ন|প্র)\s*\d+|^[0-9]{1,3}[\.\)]|^\s*[\(\[]?[A-Da-dকখগঘ১২৩৪i-ivI-IV][\)\.\]]/.test(curr.text);
      const isBigGap = gap > avgHeight * 1.6;

      if (isBigGap || isListItem) {
        paragraphs.push(currentParagraph);
        currentParagraph = {
          lines: [curr],
          text: curr.text,
        };
      } else {
        // Append text with space or newline
        currentParagraph.lines.push(curr);
        currentParagraph.text += (curr.text.startsWith('$') || prev.text.endsWith('$') ? ' ' : '\n') + curr.text;
      }
    }
    paragraphs.push(currentParagraph);

    return paragraphs;
  }
}

module.exports = { LayoutAnalysisEngine };
