/**
 * PreviewRenderer Service
 * Formats question structures and LaTeX math blocks to ensure safe and beautiful rendering in KaTeX / Flutter components.
 */
class PreviewRenderer {
  /**
   * Render preview blocks from LaTeX text.
   * Wraps mathematical blocks and ensures LaTeX is well-formed.
   * @param {string} text
   * @returns {string}
   */
  static renderPreviewText(text) {
    if (!text) return '';
    let rendered = text;

    // Standardize all backslash-brackets to KaTeX-standard double dollar delimiters
    rendered = rendered.replace(/\\\[/g, '$$$$').replace(/\\\]/g, '$$$$');
    rendered = rendered.replace(/\\\(/g, '$$').replace(/\\\)/g, '$$');

    // Ensure all LaTeX matrices or cases are correctly wrapped inside math mode if not already
    const environments = ['matrix', 'pmatrix', 'bmatrix', 'align', 'cases', 'array'];
    for (const env of environments) {
      const regex = new RegExp(`\\\\begin{${env}}.*?\\\\end{${env}}`, 'gs');
      rendered = rendered.replace(regex, (match) => {
        // If not already inside dollars, wrap with double dollars
        const preceding = rendered.substring(0, rendered.indexOf(match)).trim();
        const succeeding = rendered.substring(rendered.indexOf(match) + match.length).trim();
        
        const isPrecededByDollar = preceding.endsWith('$');
        const isSucceededByDollar = succeeding.startsWith('$');

        if (!isPrecededByDollar && !isSucceededByDollar) {
          return `$$${match}$$`;
        }
        return match;
      });
    }

    return rendered;
  }

  /**
   * Prepares a full question object for LaTeX-safe JSON preview rendering.
   * @param {object} item - Object containing questionText and options
   */
  static prepareQuestionPreview(item) {
    if (!item) return null;

    const questionText = item.questionText || item.question || '';
    const options = item.options || [];

    const formattedOptions = options.map(opt => {
      if (typeof opt === 'object' && opt !== null) {
        return {
          ...opt,
          text: this.renderPreviewText(opt.text)
        };
      } else if (typeof opt === 'string') {
        return this.renderPreviewText(opt);
      }
      return opt;
    });

    return {
      questionText: this.renderPreviewText(questionText),
      options: formattedOptions,
      questionNumber: item.questionNumber || '',
      detectionOrder: item.detectionOrder || 0
    };
  }
}

module.exports = { PreviewRenderer };
