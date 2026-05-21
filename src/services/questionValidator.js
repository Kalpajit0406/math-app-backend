/**
 * QuestionValidator Service
 * Validates parsed questions for schema-compliance and basic quality rules before they are served or finalized.
 */
class QuestionValidator {
  /**
   * Validate a question item.
   * @param {object} questionItem - The parsed question object
   * @returns {object} { isValid: boolean, errors: string[] }
   */
  static validate(questionItem) {
    const errors = [];

    if (!questionItem) {
      return { isValid: false, errors: ['Question item is null or undefined'] };
    }

    const questionText = (questionItem.questionText || questionItem.question || '').trim();
    if (!questionText) {
      errors.push('Question text cannot be blank.');
    }

    const options = questionItem.options;
    if (!Array.isArray(options)) {
      errors.push('Options must be a valid array.');
    } else {
      // Filter blank options or check options length
      const optionTexts = options.map(opt => (typeof opt === 'object' && opt !== null) ? opt.text : opt);
      
      const emptyOptions = optionTexts.filter(text => !text || text.trim() === '');
      if (emptyOptions.length > 2) {
        errors.push('At least two options must have valid text contents.');
      }

      // Check for duplicate options (non-empty ones)
      const filledOptions = optionTexts.filter(text => text && text.trim() !== '');
      const uniqueFilledOptions = new Set(filledOptions.map(t => t.trim()));
      if (filledOptions.length !== uniqueFilledOptions.size) {
        errors.push('Duplicate option texts are not allowed.');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

module.exports = { QuestionValidator };
