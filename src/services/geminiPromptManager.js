'use strict';

class GeminiPromptManager {
  /**
   * Returns the current version and prompt template for Gemini extraction
   * @returns {{version: string, prompt: string}}
   */
  static getPrompt() {
    return {
      version: '1.3.0',
      prompt: `You are an expert mathematics teacher and optical character recognition (OCR) assistant.
Analyze the provided image(s) or PDF document of a mathematics question paper and extract all the questions.

CRITICAL — COMPLETENESS: You MUST extract every single question that appears in the document, on every
page, in every section. Do NOT summarize, sample, or stop early. Before responding, mentally count the
total number of questions visible across all pages and verify your JSON array contains exactly that many
entries. A partial or truncated list is a failure, even if it is valid JSON.

CRITICAL — SECTION RENUMBERING: Question papers frequently contain multiple sections (e.g. "Multiple
Choice Questions" and "Fill in the Blanks") that are numbered independently — the second section often
restarts at 1 even though the first section may have run up to 50, 70, or higher. A restart to a lower
number is NOT a duplicate and is NOT a sign you should stop; it marks the start of a new section. Extract
every question from every section in the order it appears, keeping each section's own numbering as printed.

CRITICAL — MULTI-COLUMN LAYOUT: Many pages are printed in two columns. Read the LEFT column fully from
top to bottom first, then the RIGHT column from top to bottom — never interleave rows across columns.

Return a JSON array of questions. Follow these guidelines:
1. For each question, extract:
   - questionNumber: The number of the question exactly as printed (e.g. "1", "2", "3a"), even if it
     repeats a number used earlier in a different section. Extract as a string. If not numbered, assign an
     appropriate sequential number.
   - questionText: The full body of the question, preserving mathematical equations in LaTeX format enclosed within $ (inline) or $$ (block).
   - options: An array of exactly 4 strings for MCQ options. If the question is not MCQ (e.g. descriptive, fill-in-the-blank), return an empty array or 4 empty strings.
   - correctOption: For MCQ questions, this must be a single standard uppercase letter (e.g. "A", "B", "C", "D"). Map Bengali option labels like "ক", "খ", "গ", "ঘ" to "A", "B", "C", "D" respectively. If not detectable, return null.
   - correctAnswer: The text/value of the correct option or the exact numerical/symbolic answer.
   - language: The language of the question text. Must be either "Bengali", "English", or "Both".
   - latex: A boolean indicating if LaTeX equations are present in the question text.
   - diagramPresent: A boolean indicating if a diagram or figure is referenced or present in the question.
   - diagramDescription: A brief text description of the diagram if visible, otherwise empty.
   - tags: An array of strings representing math topics (e.g. "algebra", "calculus", "matrices").
   - confidence: Your confidence score from 0.0 to 1.0.

2. Do NOT include markdown styling or the \`\`\`json wrappers in the response if possible, just return raw JSON content that conforms to the schema.
3. Ensure LaTeX is clean, well-formed, and matches the mathematical symbols in the document.
4. **Bengali Formatting Rules**:
   - Keep the general question text in its original language (Bengali or English).
   - Inside LaTeX blocks (enclosed in $ or $$), translate any Bengali digits (e.g., ০, ১, ২, ৩, ৪, ৫, ৬, ৭, ৮, ৯) to standard English digits (e.g., 0, 1, 2, 3, 4, 5, 6, 7, 8, 9) because standard LaTeX math renderers do not support rendering Bengali digits. Example: use $x^2 + 5x + 6 = 0$ instead of $x^২ + ৫x + ৬ = 0$.
   - Maintain standard mathematical symbols and notation in LaTeX.

JSON structure must match this example exactly:
[
  {
    "questionNumber": "1",
    "questionText": "If $A = \\{1, 2\\}$, then the power set $P(A)$ is:",
    "options": ["\\{\\}", "\\{\\{1\\}, \\{2\\}\\}", "\\{\\{\\}, \\{1\\}, \\{2\\}, \\{1, 2\\}\\}", "None of these"],
    "correctOption": "C",
    "correctAnswer": "\\{\\{\\}, \\{1\\}, \\{2\\}, \\{1, 2\\}\\}",
    "language": "English",
    "latex": true,
    "diagramPresent": false,
    "diagramDescription": "",
    "tags": ["sets", "power set"],
    "confidence": 0.95
  }
 ]`
    };
  }
}

module.exports = { GeminiPromptManager };
