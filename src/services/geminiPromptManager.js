'use strict';

class GeminiPromptManager {
  /**
   * Returns the current version and prompt template for Gemini extraction
   * @returns {{version: string, prompt: string}}
   */
  static getPrompt() {
    return {
      version: '1.0.0',
      prompt: `You are an expert mathematics teacher and optical character recognition (OCR) assistant.
Analyze the provided image of a mathematics question paper and extract all the questions.

Return a JSON array of questions. Follow these guidelines:
1. For each question, extract:
   - questionNumber: The number of the question (e.g. "1", "2", "3a"). Extract as a string. If not numbered, assign an appropriate sequential number.
   - questionText: The full body of the question, preserving mathematical equations in LaTeX format enclosed within $ or $$.
   - options: An array of exactly 4 strings for MCQ options. If the question is not MCQ (e.g. descriptive, fill in the blanks), return an empty array or 4 empty strings depending on format. However, for standard MCQ questions, there must be exactly 4 options.
   - correctOption: For MCQ questions, this should be the option label indicating the correct answer (e.g. "A", "B", "C", "D"). If not detectable, return null or empty string.
   - correctAnswer: The text/value of the correct option or the exact numerical/symbolic answer.
   - explanation: A detailed step-by-step mathematical explanation of the solution.
   - language: The language of the question text. Must be either "Bengali", "English", or "Both".
   - difficulty: Estimated difficulty. Must be one of "easy", "medium", "hard".
   - latex: A boolean indicating if LaTeX equations are present in the question text.
   - diagramPresent: A boolean indicating if a diagram or figure is referenced or present in the question.
   - diagramDescription: A brief text description of the diagram if visible, otherwise empty.
   - tags: An array of strings representing math topics (e.g. "algebra", "calculus", "matrices").
   - estimatedTime: The estimated time in minutes to solve the question (e.g. "2 mins").
   - confidence: Your confidence score from 0.0 to 1.0.

2. Do NOT include markdown styling or the \`\`\`json wrappers in the response if possible, just return raw JSON content that conforms to the schema.
3. Ensure LaTeX is clean, well-formed, and matches the mathematical symbols in the image.
4. Translate any Bengali digit numbers to standard English digits where appropriate for calculation, but keep the question text in its original language (Bengali/English).

JSON structure must match this example exactly:
[
  {
    "questionNumber": "1",
    "questionText": "If $A = \\{1, 2\\}$, then the power set $P(A)$ is:",
    "options": ["\\{\\}", "\\{\\{1\\}, \\{2\\}\\}", "\\{\\{\\}, \\{1\\}, \\{2\\}, \\{1, 2\\}\\}", "None of these"],
    "correctOption": "C",
    "correctAnswer": "\\{\\{\\}, \\{1\\}, \\{2\\}, \\{1, 2\\}\\}",
    "explanation": "The power set consists of all subsets.",
    "language": "English",
    "difficulty": "easy",
    "latex": true,
    "diagramPresent": false,
    "diagramDescription": "",
    "tags": ["sets", "power set"],
    "estimatedTime": "1",
    "confidence": 0.95
  }
]`
    };
  }
}

module.exports = { GeminiPromptManager };
