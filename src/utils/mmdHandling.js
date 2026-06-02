// Enhanced Mathpix Question Extraction - JavaScript Implementation
const { LatexSanitizer } = require('../services/latexSanitizer');

// Helper function to escape special regex characters
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Converts Bengali Unicode digits (০-৯) to their ASCII equivalents
function bengaliToEnglishDigits(str) {
  if (!str) return str;
  return str.replace(/[০-৯]/g, (ch) => String(ch.codePointAt(0) - 0x09E6));
}

// Process Mathpix API response to get the best text format
function processMathpixResponse(response) {
    let textToProcess = '';
    
    if (response.data && response.data.length > 0) {
        // Prefer structured data if available
        textToProcess = response.data
            .map(item => item.value)
            .join(' ');
        console.log("Using Mathpix structured data format");
    } else if (response.text) {
        // Fall back to text format
        textToProcess = response.text;
        console.log("Using Mathpix text format");
    } else if (response.html) {
        // Last resort: HTML format
        textToProcess = response.html;
        console.log("Using Mathpix HTML format");
    }
    
    console.log("Mathpix confidence:", response.confidence);
    console.log("Is printed:", response.is_printed);
    console.log("Processing text preview:", textToProcess.substring(0, 200) + "...");
    
    return textToProcess;
}

// Clean Mathpix content while preserving math notations and inequalities
function cleanMathpixContent(text) {
    return text
        // Remove specific Mathpix HTML artifacts while preserving math content
        .replace(/<span[^>]*class="katex[^"]*"[^>]*>(.*?)<\/span>/gs, '$1')
        .replace(/<math[^>]*>(.*?)<\/math>/gs, '$1')
        .replace(/<asciimath[^>]*>(.*?)<\/asciimath>/gs, '$1')
        .replace(/<latex[^>]*>(.*?)<\/latex>/gs, '$1')
        .replace(/=<span.*?<\/span>/gs, '')
        .replace(/=<spanclass="katex−display">.*?<\/span>/gs, '')
        
        // Remove HTML attributes but preserve content
        .replace(/class="[^"]*"/g, '')
        .replace(/style="[^"]*"/g, '')
        .replace(/display:\s*none;?/g, '')
        .replace(/aria−hidden="true"/g, '')
        .replace(/mathbackground="[^"]*"/g, '')
        .replace(/width="[^"]*"/g, '')
        .replace(/height="[^"]*"/g, '')
        
        // Protect mathematical inequalities before HTML stripping
        .replace(/(\$[^$]*)<([^$]*\$)/g, '$1LESS_THAN$2')
        .replace(/(\$[^$]*)>([^$]*\$)/g, '$1GREATER_THAN$2')
        .replace(/(\w+|\d+)\s*&lt;\s*(\w+|\d+)/g, '$1 LESS_THAN $2')
        .replace(/(\w+|\d+)\s*&gt;\s*(\w+|\d+)/g, '$1 GREATER_THAN $2')
        .replace(/(\w+|\d+)\s*<\s*(\w+|\d+)/g, '$1 LESS_THAN $2')
        .replace(/(\w+|\d+)\s*>\s*(\w+|\d+)/g, '$1 GREATER_THAN $2')
        .replace(/([a-zA-Z]+)\s*<\s*([a-zA-Z]+)/g, '$1 LESS_THAN $2')
        .replace(/([a-zA-Z]+)\s*>\s*([a-zA-Z]+)/g, '$1 GREATER_THAN $2')
        .replace(/\\\[(.*?)\\\]/gs, '\$$1\$')
        
        // Strip non-essential formatting HTML tags
        .replace(/<\/?(?:div|span|p|br|hr|table|tr|td|th)[^>]*>/gi, '')
        .replace(/<(?!\/?(b|i|u|strong|em|sub|sup)\b)[^>]*>/gi, '')
        
        // Restore math symbols
        .replace(/LESS_THAN/g, '<')
        .replace(/GREATER_THAN/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&[a-zA-Z0-9#]+;/g, '')
        
        // Fix LaTeX spacing
        .replace(/(\w)(\$vec\{)/g, '$1 $2')
        .replace(/(\w)(\$[^$]*\$)/g, '$1 $2')
        .replace(/(\$[^$]*\$)(\w)/g, '$1 $2')
        .replace(/(\w)(\\\()/g, '$1 $2')
        .replace(/(\\\))(\w)/g, '$1 $2')
        .replace(/(\w)(\\\[)/g, '$1 $2')
        .replace(/(\\\])(\w)/g, '$1 $2')
        
        // Clean math formulas
        .replace(/\$\s*\$\s*/g, ' ')
        .replace(/\$([^$]*)\$/g, '$$$1$$')
        .replace(/−/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .replace(/\hline\s*/g, '\hline\n')
        .replace(/\\\s*\hline/g, '\\\n\hline')
        .trim();
}

// Standard helper pattern: extract MCQ options from raw block
function extractMCQOptions(text) {
    const options = [];
    
    // Pattern 1: Standard (a) option (b) option
    const pattern1 = /\(([abcdABCD])\)\s*([^()]*?)(?=\s*\([abcdABCD]\)|$)/gs;
    let matches = [...text.matchAll(pattern1)];
    
    if (matches.length >= 4) {
        matches.slice(0, 4).forEach((match) => {
            if (match[2]?.trim()) {
                options.push(match[2].trim().replace(/\s+/g, ' ').replace(/^\s*[।\.]\s*/, '').trim());
            }
        });
        return options;
    }
    
    // Pattern 2: Line-separated options
    const lines = text.split(/\n+/).map(line => line.trim()).filter(line => line.length > 0);
    const optionLines = lines.filter(line => 
        /^\s*\([abcdABCD]\)/i.test(line) || 
        /^\s*[abcdABCD][\.\)]/i.test(line)
    );
    
    if (optionLines.length >= 4) {
        optionLines.slice(0, 4).forEach((line) => {
            const cleaned = line.replace(/^\s*[\(]?[abcdABCD][\.\)]\s*/i, '').replace(/\s+/g, ' ').trim();
            if (cleaned) options.push(cleaned);
        });
        return options;
    }
    
    // Pattern 3: Alternative delimiters a. option b. option
    const pattern3 = /(?:^|[^a-zA-Z])([abcdABCD])[\.\)]\s*([^.\n]+?)(?=\s*[abcdABCD][\.\)]|$)/gm;
    matches = [...text.matchAll(pattern3)];
    
    if (matches.length >= 4) {
        matches.slice(0, 4).forEach((match) => {
            if (match[2]?.trim()) {
                options.push(match[2].trim().replace(/\s+/g, ' ').replace(/[।\.]$/, '').trim());
            }
        });
        return options;
    }
    
    return [];
}

// PART 1: CONTENT CLASSIFICATION & STRUCTURE EXTRACTION
function classifyLine(line) {
    const trimmed = line.trim();
    
    let isHeader = false;
    let isFooter = false;
    let isPageNumber = false;
    let isAnswerKey = false;
    let isSectionTitle = false;
    let isTableOrGrid = false;
    let isQuestionStart = false;
    let questionNumber;
    let questionStartText;

    // Page number detection
    if (/^(?:page|pg)?\s*[-–—]?\s*\d+\s*[-–—]?\s*$/i.test(trimmed)) {
        isPageNumber = true;
    }

    // Section title / header boundary detection
    const sectionTitleRegex = /\\section\*?\{([^}]+)\}|\\subsection\*?\{([^}]+)\}|^(?:EXERCISE|Conventional Type|HS CORNER|Multiple Choice Questions|Fill in the Blanks|Column Matching|Analytical Type|Short Answer Type|Long Answer Type|উত্তরমালা|উত্তর)\b/i;
    if (sectionTitleRegex.test(trimmed)) {
        isSectionTitle = true;
    }

    // Common header metadata markers
    const headerNoiseRegex = /^(?:chapter|subject|marks|class|level|publisher|branding|copyright|semester|time|full marks|instruction)/i;
    if (headerNoiseRegex.test(trimmed)) {
        isHeader = true;
    }

    // Table / tabular markup identification
    if (trimmed.includes('\\begin{tabular}') || trimmed.includes('\\end{tabular}') || (trimmed.includes('|') && trimmed.split('|').length > 3)) {
        isTableOrGrid = true;
    }

    // Filter out dense answer key patterns that mimic question lines (e.g., "5. (B)")
    const denseAnswerKeyRegex = /^\d{1,3}\s*[\.\)]\s*\(?[a-dABCDক-ঘ]\)?\s*$/;
    if (denseAnswerKeyRegex.test(trimmed)) {
        isAnswerKey = true;
    } else {
        // Question boundary initialization check
        const questionStartRegex = /^(?:Q|Question\s*)?(\d{1,3})\s*[\.\)]\s+(.+)/i;
        const match = trimmed.match(questionStartRegex);
        if (match) {
            const rest = match[2].trim();
            const restIsOptionOnly = /^\(?[a-dABCDক-ঘi-iv-xI-XV-X]\)?\s*$/i.test(rest);
            if (restIsOptionOnly) {
                isAnswerKey = true;
            } else {
                isQuestionStart = true;
                questionNumber = parseInt(match[1], 10);
                questionStartText = rest;
            }
        }
    }

    return {
        text: trimmed,
        isHeader,
        isFooter,
        isPageNumber,
        isAnswerKey,
        isSectionTitle,
        isTableOrGrid,
        isQuestionStart,
        questionNumber,
        questionStartText
    };
}

// PART 3: ANSWER PAGE DETECTION
function isAnswerKeyPage(pageText) {
    if (!pageText) return false;
    const normalized = pageText.toLowerCase();
    
    // Explicit keywords
    const explicitHeadingRegex = /(?:answer\s*key|answers|answer\s*sheet|উত্তরমালা|উত্তর|সংক্ষিপ্ত\s*উত্তরমালা|conventional\s*type\s*answers?|correct\s*options?|key\s*answers?)/i;
    if (explicitHeadingRegex.test(normalized)) {
        return true;
    }

    const lines = pageText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return false;

    let answerPatternCount = 0;
    const singleAnswerRegex = /^\d{1,3}\s*[\.\-\):\s]\s*\(?[A-DABCDকখগঘ১২৩৪i-ivI-IV]\)?\s*$/i;
    const multipleAnswersRegex = /^(?:\d{1,3}\s*[\.\-\):\s]\s*\(?[A-DABCDকখগঘ১২৩৪i-ivI-IV]\)?(?:\s+|$)){2,}$/i;

    for (const line of lines) {
        if (singleAnswerRegex.test(line) || multipleAnswersRegex.test(line)) {
            answerPatternCount++;
        }
    }

    const ratio = answerPatternCount / lines.length;
    if (ratio > 0.20 || answerPatternCount >= 4) {
        return true;
    }

    return false;
}

// Helpers for section routing
function detectTableOrGrid(text) {
    if (!text) return false;
    const normalized = text.toLowerCase();
    if (normalized.includes('\\begin{matrix}') || normalized.includes('\\begin{pmatrix}') || normalized.includes('\\begin{bmatrix}') || normalized.includes('\\begin{array}')) {
        return true;
    }
    if (normalized.includes('\\begin{tabular}') || normalized.includes('\\end{tabular}')) {
        return true;
    }
    if (normalized.includes('column a') || normalized.includes('column b') || 
        normalized.includes('স্তম্ভ a') || normalized.includes('স্তম্ভ b') || 
        normalized.includes('স্তম্ভ-i') || normalized.includes('স্তম্ভ-ii') ||
        normalized.includes('match the column') || normalized.includes('स्तंभ')) {
        return true;
    }
    if (/\[[a-d1-4i-v]\]\s*-\s*\[[a-d1-4i-v]\]/i.test(text) || /\([a-d1-4i-v]\)\s*-\s*\(?[a-d1-4i-v]\)?/i.test(text)) {
        return true;
    }
    const pipeCount = (text.match(/\|/g) || []).length;
    if (pipeCount >= 4) return true;
    return false;
}

function detectFillInBlank(text) {
    if (!text) return false;
    const normalized = text.toLowerCase();
    if (normalized.includes('fill in the blank') || normalized.includes('শূন্যস্থান') || normalized.includes('रिक्त स्थान')) {
        return true;
    }
    if (text.includes('_____') || text.includes('....') || text.includes('. . . .')) {
        return true;
    }
    return false;
}

// PART 5: ISOLATED MCQ OPTION PARSING
function extractOptionsAndCleanQuestion(blockText) {
    // Isolate options inside the segmented question block to prevent option leakage
    const optionRegex = /(?:\s+|^)(?:\(([a-dABCDক-ঘi-iv-xI-XV-X])\)|([a-dABCDক-ঘi-iv-xI-XV-X])[\.\)]|([a-dABCDক-ঘi-iv-xI-XV-X])\s*\))\s+([^]*?)(?=\s+(?:\([a-dABCDক-ঘi-iv-xI-XV-X]\)|[a-dABCDক-ঘi-iv-xI-XV-X][\.\)]|[a-dABCDক-ঘi-iv-xI-XV-X]\s*\))\s+|$)/g;

    const matches = [...blockText.matchAll(optionRegex)];
    const optionsMap = new Map();
    let firstOptionIndex = -1;

    for (const match of matches) {
        const label = (match[1] || match[2] || match[3] || '').toUpperCase().trim();
        const optionContent = match[4].trim();
        const matchIndex = match.index || 0;

        if (label && optionContent) {
            let canonicalLabel = label;
            if (label === 'ক') canonicalLabel = 'A';
            if (label === 'খ') canonicalLabel = 'B';
            if (label === 'গ') canonicalLabel = 'C';
            if (label === 'ঘ') canonicalLabel = 'D';

            if (!optionsMap.has(canonicalLabel)) {
                optionsMap.set(canonicalLabel, optionContent);
                if (firstOptionIndex === -1 || matchIndex < firstOptionIndex) {
                    firstOptionIndex = matchIndex;
                }
            }
        }
    }

    let question = blockText;
    if (optionsMap.size > 0 && firstOptionIndex !== -1) {
        question = blockText.substring(0, firstOptionIndex).trim();
    }

    const options = [];
    const keys = ['A', 'B', 'C', 'D'];
    
    let isRoman = false;
    for (const key of optionsMap.keys()) {
        if (['I', 'II', 'III', 'IV'].includes(key)) {
            isRoman = true;
            break;
        }
    }

    if (isRoman) {
        const romanKeys = ['I', 'II', 'III', 'IV'];
        romanKeys.forEach(k => {
            options.push(optionsMap.get(k) || '');
        });
    } else {
        keys.forEach(k => {
            options.push(optionsMap.get(k) || '');
        });
    }

    const hasAnyOption = options.some(opt => opt.length > 0);
    
    return {
        question: question.trim(),
        options: hasAnyOption ? options : []
    };
}

// Determine question type based on content analysis
function determineQuestionType(questionText, options, hasTabular, hasColumnMatching, hasFillInBlank) {
    if (hasColumnMatching) {
        return 'column_matching';
    } else if (hasTabular && !hasColumnMatching) {
        return 'multiple_choice_with_table';
    } else if (hasFillInBlank || (options && options.length === 0)) {
        return 'fill_in_blank';
    } else if (options && options.length === 4) {
        return 'multiple_choice';
    } else if (options && options.length > 0 && options.length < 4) {
        return 'incomplete_multiple_choice';
    } else {
        return 'other';
    }
}

// PART 9: VALIDATION ENGINE
function validateQuestion(q, seenNumbers) {
    const trimmedText = q.question.trim();
    
    if (trimmedText.length < 5) {
        return { isValid: false, reason: "Question text too short (< 5 chars)" };
    }
    
    const lowercaseText = trimmedText.toLowerCase();
    if (lowercaseText === "question text" || lowercaseText === "q.no." || lowercaseText === "question" || lowercaseText === "no.") {
        return { isValid: false, reason: "Question text is placeholder or table label" };
    }

    // Slipped dense answer key pattern check
    const answerKeyPattern = /^\s*\(?[a-dABCDক-ঘi-iv-xI-XV-X]\)?\s*$/i;
    if (answerKeyPattern.test(trimmedText)) {
        return { isValid: false, reason: "Text represents a leaked answer key option" };
    }

    // Slipped section header check
    const sectionHeaderPattern = /^(?:EXERCISE|Conventional Type|HS CORNER|Multiple Choice Questions|Fill in the Blanks|Column Matching|Analytical Type)\s*$/i;
    if (sectionHeaderPattern.test(trimmedText)) {
        return { isValid: false, reason: "Text matches header metadata title" };
    }

    // Section-scoped uniqueness validation
    if (seenNumbers.has(q.questionNumber)) {
        return { isValid: false, reason: `Duplicate question number ${q.questionNumber} in current section` };
    }

    return { isValid: true };
}

// Main extraction flow implementing the Correct Architecture
function extractQuestionsFromMathpix(mathpixResponse, debug = false) {
    const questions = [];
    
    console.log("=== Starting Enhanced Mathpix Question Extraction (Correct Architecture) ===");
    
    const processedText = processMathpixResponse(mathpixResponse);
    if (!processedText.trim()) {
        console.error("No text received from Mathpix response");
        return [];
    }
    
    const cleanedText = cleanMathpixContent(processedText);
    const normalizedText = bengaliToEnglishDigits(cleanedText);

    // STEP 1 & 2: Layout segmentation (extract pages)
    const pages = normalizedText.split(/(?:\\pagebreak|\\newpage)/);
    console.log(`[Layout] Document segmented into ${pages.length} pages.`);

    let currentSection = "Default";
    let lastParserType = "MCQ";
    const seenNumbers = new Set();

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
        const pageText = pages[pageIdx];
        if (!pageText.trim()) continue;

        // STEP 3: Answer key page detection & filtering
        if (isAnswerKeyPage(pageText)) {
            console.log(`[Diagnostic] Filtered ANSWER_KEY_PAGE at Page ${pageIdx + 1}`);
            continue;
        }

        const lines = pageText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        // STEP 4 & 5: Content classification & Question block segmentation
        const rawBlocks = [];
        let currentBlock = null;

        for (const line of lines) {
            const classified = classifyLine(line);

            // Filter page headers, footers and page numbering noise
            if (classified.isHeader || classified.isFooter || classified.isPageNumber) {
                if (debug) console.log(`[Diagnostic] Ignored Header/Footer: "${line}"`);
                continue;
            }

            // Section boundary title detection (resets uniqueness scope)
            if (classified.isSectionTitle) {
                currentSection = line;
                seenNumbers.clear(); // Reset duplicate checks for this section
                currentBlock = null; 
                console.log(`[Section] Entered Section: "${currentSection}" - Reset unique number scope`);
                continue;
            }

            // Filter stray answer key lines
            if (classified.isAnswerKey) {
                currentBlock = null;
                if (debug) console.log(`[Diagnostic] Ignored Answer Key Segment: "${line}"`);
                continue;
            }

            // Segmentation-first question boundaries
            if (classified.isQuestionStart) {
                currentBlock = {
                    questionNumber: classified.questionNumber,
                    lines: [classified.questionStartText],
                    hasTabular: classified.isTableOrGrid
                };
                rawBlocks.push(currentBlock);
                continue;
            }

            // Append context to active question block
            if (currentBlock) {
                currentBlock.lines.push(line);
                if (classified.isTableOrGrid) currentBlock.hasTabular = true;
            }
        }

        // STEP 6: option parsing & Routing & Safe Math normalization
        for (const block of rawBlocks) {
            const fullBlockText = block.lines.join('\n');

            // Table or Fill routing
            const isTable = detectTableOrGrid(fullBlockText);
            const isFill = detectFillInBlank(fullBlockText);

            let questionType = 'multiple_choice';
            let parsed;
            let trimmedOptions;

            if (isTable) {
                questionType = 'column_matching';
                parsed = { question: fullBlockText, options: [] };
                trimmedOptions = ['', '', '', ''];
            } else if (isFill) {
                questionType = 'fill_in_blank';
                parsed = { question: fullBlockText, options: [] };
                trimmedOptions = ['', '', '', ''];
            } else {
                parsed = extractOptionsAndCleanQuestion(fullBlockText);
                let finalOptions = [...parsed.options];
                if (finalOptions.length === 0) {
                    const fallbackOpts = extractMCQOptions(fullBlockText);
                    if (fallbackOpts.length > 0) {
                        finalOptions = [...fallbackOpts];
                    }
                }
                while (finalOptions.length < 4) {
                    finalOptions.push('');
                }
                trimmedOptions = finalOptions.slice(0, 4);
                
                const hasTabular = block.hasTabular;
                const hasColumnMatching = parsed.question.includes('স্তম্ভ A') || parsed.question.includes('স্তম্ভ B') || 
                                          parsed.question.includes('Column A') || parsed.question.includes('Column B');
                const hasFillInBlank = parsed.question.includes('_____') || 
                                      (parsed.question.includes('=') && parsed.question.includes('।'));
                
                questionType = determineQuestionType(parsed.question, trimmedOptions, hasTabular, hasColumnMatching, hasFillInBlank);
            }

            // RESET state if parser type changed
            if (lastParserType !== questionType) {
                seenNumbers.clear();
                lastParserType = questionType;
            }

            // Safe Math normalization using LatexSanitizer
            const sanitizedQuestion = LatexSanitizer.sanitize(parsed.question, mathpixResponse.confidence);
            const sanitizedOptions = trimmedOptions.map(opt => LatexSanitizer.sanitize(opt, mathpixResponse.confidence));

            const questionObj = {
                questionNumber: block.questionNumber,
                question: sanitizedQuestion,
                diagram: null,
                options: sanitizedOptions.some(opt => opt.trim()) ? sanitizedOptions : null,
                type: questionType,
                metadata: {
                    hasTabular: block.hasTabular || isTable,
                    hasColumnMatching: questionType === 'column_matching',
                    hasFillInBlank: questionType === 'fill_in_blank',
                    optionCount: sanitizedOptions.filter(opt => opt.trim().length > 0).length,
                    rawSectionLength: fullBlockText.length,
                    confidence: mathpixResponse.confidence
                }
            };

            // Validation check before queue generation
            const validation = validateQuestion(questionObj, seenNumbers);
            if (validation.isValid) {
                seenNumbers.add(block.questionNumber);
                questions.push(questionObj);
                if (debug) {
                    console.log(`[Queue] Added Q${block.questionNumber}: "${sanitizedQuestion.substring(0, 60)}..."`);
                }
            } else {
                console.log(`[Validation Failed] Skipped Q${block.questionNumber} - Reason: ${validation.reason}`);
            }
        }
    }

    console.log(`=== Extraction Complete: ${questions.length} valid questions added to queue ===`);
    return questions;
}

// Debug utility function
function debugMathpixExtraction(mathpixResponse) {
    console.log("=== Mathpix Response Debug Info ===");
    console.log("Confidence:", mathpixResponse.confidence);
    console.log("Is printed:", mathpixResponse.is_printed);
    console.log("Is handwritten:", mathpixResponse.is_handwritten);
    console.log("Has text:", !!mathpixResponse.text);
    console.log("Has HTML:", !!mathpixResponse.html);
    console.log("Has data:", !!mathpixResponse.data);
    
    if (mathpixResponse.text) {
        console.log("Text preview:", mathpixResponse.text.substring(0, 500) + "...");
    }
    
    if (mathpixResponse.html) {
        console.log("HTML preview:", mathpixResponse.html.substring(0, 300) + "...");
    }
    
    const extracted = extractQuestionsFromMathpix(mathpixResponse, true);
    console.log("=== Extraction Results ===");
    console.log("Total questions extracted:", extracted.length);
    
    extracted.forEach((q, i) => {
        console.log(`\n--- Question ${i + 1} ---`);
        console.log("Number:", q.questionNumber);
        console.log("Type:", q.type);
        console.log("Question:", q.question.substring(0, 100) + "...");
        console.log("Options:", q.options?.map(opt => opt.substring(0, 50) + "..."));
        console.log("Option count:", q.metadata.optionCount);
    });
}

module.exports = {
    extractQuestionsFromMathpix,
    debugMathpixExtraction,
};
