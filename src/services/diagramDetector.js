/**
 * DiagramDetector — Phase 8: Diagram Region Detection & Classification
 *
 * DETECTS:
 *   - Venn diagrams
 *   - Geometry figures (triangles, circles, polygons)
 *   - Graphs (line graphs, bar charts, histograms)
 *   - Coordinate planes (axes, x-y plane)
 *   - Tables
 *   - Number lines
 *
 * INPUT:
 *   - lineObjects[]  (with bounding boxes, from PageLayoutAnalyzer)
 *   - rawText        (for text-signal based detection)
 *
 * OUTPUT:
 *   {
 *     diagramPresent      : boolean,
 *     diagrams            : DiagramInfo[],
 *     diagramPresenceScore: number,   // 0.0–1.0 confidence
 *   }
 *
 *   DiagramInfo: {
 *     type           : string,        // 'venn'|'geometry'|'graph'|'table'|'coordinate'|'unknown'
 *     label          : string,        // e.g. "Fig. 3" or detected label
 *     boundingBox    : { x, y, w, h } | null,
 *     textSignals    : string[],      // text lines that triggered detection
 *   }
 *
 * IMPORTANT:
 *   - Diagram regions must NOT be OCR'd as text (the pipeline skips them).
 *   - diagramPresent=true triggers diagramPresent field in question output.
 *   - bounding boxes are passed through from geometry-aware analysis.
 */

'use strict';

// ─── TEXT SIGNALS FOR DIAGRAM DETECTION ───────────────────────────────────────

const DIAGRAM_TEXT_SIGNALS = {
  venn: [
    /venn\s*diagram/i,
    /set\s*(?:A|B|C|P|Q|R)\s*∩/,
    /A\s*∩\s*B/,
    /A\s*∪\s*B/,
    /n\s*\(\s*A\s*\)/i,
    /সেট\s*[A-Z]/i,
  ],

  geometry: [
    /\b(?:triangle|circle|square|rectangle|polygon|hexagon|pentagon|rhombus|trapezium|trapezoid|quadrilateral|parallelogram)\b/i,
    /\b(?:∠|angle|radius|diameter|chord|arc|tangent|secant|perpendicular|bisect)\b/i,
    /\b(?:AB|BC|CD|AC|BD)\s*=/i,   // line segment notation
    /ত্রিভুজ|বৃত্ত|বর্গ|আয়ত|কোণ/,   // Bengali geometry terms
  ],

  graph: [
    /\b(?:graph|histogram|bar\s*chart|line\s*graph|pie\s*chart|frequency\s*distribution|frequency\s*polygon)\b/i,
    /\b(?:ogive|cumulative\s*frequency)\b/i,
    /ছক|লেখচিত্র|বার\s*চার্ট/,        // Bengali graph terms
  ],

  coordinate: [
    /\b(?:coordinate\s*(?:plane|geometry|system)|x-axis|y-axis|origin|quadrant|abscissa|ordinate)\b/i,
    /\b(?:intercept|slope|gradient|locus|parabola|ellipse|hyperbola)\b/i,
    /\(\s*[-−]?\d+\s*,\s*[-−]?\d+\s*\)/,  // coordinate pair (x,y)
    /স্থানাঙ্ক|অক্ষ/,                         // Bengali coordinate terms
  ],

  table: [
    /\b(?:table|tabular|column|row)\b/i,
    /\\begin\{(?:tabular|array|table)\}/,
    /\|.+\|.+\|/,                          // markdown table pattern
    /সারণি|ছক/,                             // Bengali table terms
  ],
};

// Figure / diagram label patterns in text
const FIGURE_LABEL_RE = /^(?:fig(?:ure)?\.?\s*\d*|diagram\s*\d*|graph\s*\d*|table\s*\d*|চিত্র\s*\d*|সারণি\s*\d*|আলোকচিত্র\s*\d*)\.?\s*$/i;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function detectDiagramType(textBlock) {
  for (const [type, patterns] of Object.entries(DIAGRAM_TEXT_SIGNALS)) {
    if (patterns.some(p => p.test(textBlock))) return type;
  }
  return 'unknown';
}

// ─── MAIN CLASS ───────────────────────────────────────────────────────────────

class DiagramDetector {

  /**
   * Detect diagram presence from layout analysis results.
   *
   * @param {object} layoutAnalysis - Output from PageLayoutAnalyzer
   * @param {string} fullText       - Full OCR text for text-signal detection
   * @returns {DiagramDetection}
   */
  static detect(layoutAnalysis, fullText = '') {
    const diagrams = [];
    let presenceScore = 0;

    // ── 1. Use diagram regions from layout analysis (geometry-aware) ──────────
    if (layoutAnalysis && Array.isArray(layoutAnalysis.diagramRegions)) {
      for (const region of layoutAnalysis.diagramRegions) {
        const type = detectDiagramType(region.label || '');
        diagrams.push({
          type,
          label:       region.label || '',
          boundingBox: region.boundingBox,
          source:      'geometry-label',
          textSignals: [region.label],
        });
        presenceScore = Math.max(presenceScore, 0.90);
      }
    }

    // ── 2. Text-signal based detection ───────────────────────────────────────
    if (fullText) {
      for (const [type, patterns] of Object.entries(DIAGRAM_TEXT_SIGNALS)) {
        const matchedSignals = patterns
          .filter(p => p.test(fullText))
          .map(p => p.toString());

        if (matchedSignals.length > 0) {
          // Avoid duplicating if already found via geometry label
          const alreadyFound = diagrams.some(d => d.type === type);
          if (!alreadyFound) {
            diagrams.push({
              type,
              label:       `Detected: ${type}`,
              boundingBox: null,
              source:      'text-signal',
              textSignals: matchedSignals,
            });
            presenceScore = Math.max(presenceScore, 0.70);
          }
        }
      }
    }

    // ── 3. Figure label lines in text ─────────────────────────────────────────
    if (fullText) {
      const lines = fullText.split('\n');
      for (const line of lines) {
        if (FIGURE_LABEL_RE.test(line.trim())) {
          const type = detectDiagramType(line);
          const alreadyFound = diagrams.some(d => d.label === line.trim());
          if (!alreadyFound) {
            diagrams.push({
              type,
              label:       line.trim(),
              boundingBox: null,
              source:      'figure-label',
              textSignals: [line.trim()],
            });
            presenceScore = Math.max(presenceScore, 0.85);
          }
        }
      }
    }

    return {
      diagramPresent:       diagrams.length > 0,
      diagrams,
      diagramPresenceScore: presenceScore,
    };
  }

  /**
   * Determine if a specific question segment contains a diagram reference.
   *
   * @param {string} questionText
   * @returns {{ hasDiagram: boolean, diagramType: string|null }}
   */
  static detectInQuestion(questionText) {
    if (!questionText) return { hasDiagram: false, diagramType: null };

    // Check figure labels
    const lines = questionText.split('\n');
    for (const line of lines) {
      if (FIGURE_LABEL_RE.test(line.trim())) {
        const type = detectDiagramType(line);
        return { hasDiagram: true, diagramType: type };
      }
    }

    // Check text signals
    for (const [type, patterns] of Object.entries(DIAGRAM_TEXT_SIGNALS)) {
      if (patterns.some(p => p.test(questionText))) {
        return { hasDiagram: true, diagramType: type };
      }
    }

    return { hasDiagram: false, diagramType: null };
  }
}

module.exports = { DiagramDetector };
