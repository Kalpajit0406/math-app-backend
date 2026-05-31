const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Import fixed functions from mmdHandling.js
const {
    extractQuestionsFromMathpix,
    debugMathpixExtraction,
} = require('../utils/mmdHandling');

// Helper to dynamic import node-fetch
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// Helper function to determine if file is an image
function isImageFile(mimetype) {
    const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    return imageTypes.includes(mimetype);
}

// Helper function to get file data (handles both buffer and path)
function getFileData(file) {
    console.log('📁 Getting file data:', {
        hasBuffer: !!file.buffer,
        bufferSize: file.buffer ? file.buffer.length : 0,
        hasPath: !!file.path,
        pathExists: file.path ? fs.existsSync(file.path) : false
    });

    // Priority 1: Use buffer if available (memory storage)
    if (file.buffer && file.buffer.length > 0) {
        console.log('✅ Using file buffer');
        return file.buffer;
    } 
    
    // Priority 2: Use file path if available (disk storage)
    if (file.path && fs.existsSync(file.path)) {
        console.log('✅ Using file path (disk storage):', file.path);
        return fs.readFileSync(file.path); // Read as buffer for consistency
    }
    
    throw new Error('No valid file data found. File must have either buffer or path.');
}

// Process PDF file using Mathpix PDF api
const processPDF = async (file) => {
    const form = new FormData();
    
    try {
        const fileData = getFileData(file);
        form.append('file', fileData, file.originalname);
    } catch (fileError) {
        throw new Error(`Cannot read PDF file: ${fileError.message}`);
    }
    
    form.append('options_json', JSON.stringify({
        math_inline_delimiters: ["$", "$"],
        rm_spaces: true,
        formats: ["text", "html"]
    }));
    
    try {
        const appId = process.env.MATHPIX_API_ID;
        const appKey = process.env.MATHPIX_API_KEY;

        console.log('📡 Uploading PDF to Mathpix...');
        const postResponse = await fetch('https://api.mathpix.com/v3/pdf', {
            method: 'POST',
            body: form,
            headers: {
                ...form.getHeaders(),
                'app_id': appId,
                'app_key': appKey
            }
        });

        if (!postResponse.ok) {
            const errText = await postResponse.text();
            throw new Error(`Mathpix PDF upload error: ${postResponse.status} - ${errText}`);
        }

        const postData = await postResponse.json();
        const pdf_id = postData.pdf_id;
        console.log(`PDF uploaded successfully. PDF ID: ${pdf_id}`);
        
        // Poll for completion with exponential backoff
        const maxAttempts = 15;
        const baseInterval = 5000; // Start with 5 seconds
        let attempts = 0;
        let totalWaitTime = 0;
        
        while (attempts < maxAttempts) {
            attempts++;
            const waitTime = Math.min(baseInterval * Math.pow(1.5, attempts - 1), 15000); // Max 15 seconds
            
            console.log(`Checking PDF processing status... Attempt ${attempts}`);
            
            const statusResponse = await fetch(`https://api.mathpix.com/v3/pdf/${pdf_id}`, {
                method: 'GET',
                headers: {
                    'app_id': appId,
                    'app_key': appKey
                }
            });

            if (!statusResponse.ok) {
                const errText = await statusResponse.text();
                throw new Error(`Mathpix PDF status check error: ${statusResponse.status} - ${errText}`);
            }

            const statusData = await statusResponse.json();
            const status = statusData.status;
            console.log(`PDF Status: ${status}`);
            
            if (status === 'completed') {
                let mathpixResponse = {};
                
                try {
                    // Get text format
                    const textResponse = await fetch(`https://api.mathpix.com/v3/pdf/${pdf_id}.mmd`, {
                        method: 'GET',
                        headers: {
                            'app_id': appId,
                            'app_key': appKey
                        }
                    });
                    if (textResponse.ok) {
                        mathpixResponse.text = await textResponse.text();
                    } else {
                        console.log('MMD format not available');
                    }
                } catch (e) {
                    console.log('Failed fetching MMD format:', e.message);
                }
                
                try {
                    // Get HTML format if available
                    const htmlResponse = await fetch(`https://api.mathpix.com/v3/pdf/${pdf_id}.html`, {
                        method: 'GET',
                        headers: {
                            'app_id': appId,
                            'app_key': appKey
                        }
                    });
                    if (htmlResponse.ok) {
                        mathpixResponse.html = await htmlResponse.text();
                    } else {
                        console.log('HTML format not available');
                    }
                } catch (e) {
                    console.log('Failed fetching HTML format:', e.message);
                }
                
                // Set additional metadata
                mathpixResponse.is_printed = true;
                mathpixResponse.confidence = 0.95; // PDFs generally have high confidence
                
                return {
                    mathpixResponse: mathpixResponse,
                    id: pdf_id,
                    processingTime: `${totalWaitTime / 1000} seconds`,
                    attempts: attempts,
                    confidence: mathpixResponse.confidence
                };
                
            } else if (status === 'error' || status === 'failed') {
                throw new Error(`PDF processing failed with status: ${status}`);
            }
            
            // Wait before next attempt (except on last attempt)
            if (attempts < maxAttempts) {
                console.log(`Waiting ${waitTime / 1000} seconds before next check...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                totalWaitTime += waitTime;
            }
        }
        
        throw new Error(`PDF processing timeout after ${totalWaitTime / 1000} seconds and ${maxAttempts} attempts`);
        
    } catch (error) {
        throw error;
    }
};

// Process Image file using Mathpix text api
const processImage = async (file) => {
    console.log('\n🖼️ === PROCESSING IMAGE ===');
    console.log('File details:', {
        name: file.originalname,
        type: file.mimetype,
        size: `${(file.size / 1024).toFixed(1)}KB`,
        encoding: file.encoding,
        hasBuffer: !!file.buffer,
        hasPath: !!file.path,
        fieldname: file.fieldname
    });

    const startTime = Date.now();

    try {
        if (file.size === 0) {
            throw new Error('Empty image file');
        }

        if (file.size > 32 * 1024 * 1024) { // 32MB limit
            throw new Error(`Image too large: ${(file.size / (1024 * 1024)).toFixed(1)}MB`);
        }

        const appId = process.env.MATHPIX_API_ID;
        const appKey = process.env.MATHPIX_API_KEY;

        if (!appId || !appKey) {
            throw new Error('Missing Mathpix API credentials');
        }

        console.log('✅ API credentials validated');

        const form = new FormData();
        
        try {
            const fileData = getFileData(file);
            form.append('file', fileData, {
                filename: file.originalname,
                contentType: file.mimetype,
                knownLength: file.size
            });
            console.log('✅ File successfully added to FormData');
        } catch (fileError) {
            console.error('❌ File preparation failed:', fileError.message);
            throw new Error(`Cannot read file: ${fileError.message}`);
        }

        const basicOptions = {
            "formats": ["text", "html"],
            "math_inline_delimiters": ["$", "$"],
            "rm_spaces": true
        };

        form.append('options_json', JSON.stringify(basicOptions));
        console.log('✅ Basic compatible options added');

        console.log('📡 Making Mathpix API request...');
        const response = await fetch('https://api.mathpix.com/v3/text', {
            method: 'POST',
            body: form,
            headers: {
                ...form.getHeaders(),
                'app_id': appId,
                'app_key': appKey
            }
        });

        const processingTime = Date.now() - startTime;
        const responseStatus = response.status;
        const mathpixData = await response.json();

        console.log('📊 Mathpix API Response:', {
            status: responseStatus,
            hasText: !!mathpixData?.text,
            textLength: mathpixData?.text ? mathpixData.text.length : 0,
            hasHtml: !!mathpixData?.html,
            confidence: mathpixData?.confidence,
            hasError: !!mathpixData?.error,
            processingTime: `${processingTime}ms`
        });

        if (responseStatus >= 400) {
            let errorMsg = `Mathpix API Error ${responseStatus}`;
            switch (responseStatus) {
                case 401: errorMsg += ': Invalid API credentials'; break;
                case 402: errorMsg += ': API quota exceeded'; break;
                case 429: errorMsg += ': Rate limit exceeded'; break;
                case 413: errorMsg += ': Image too large'; break;
                case 415: errorMsg += ': Unsupported format'; break;
                default: errorMsg += `: ${mathpixData?.error || 'Unknown error'}`;
            }
            throw new Error(errorMsg);
        }

        if (mathpixData.error) {
            console.error('❌ Mathpix returned API error:', mathpixData.error);
            throw new Error(`Mathpix API error: ${mathpixData.error}`);
        }

        if (!mathpixData.text && !mathpixData.html) {
            console.warn('⚠️ No text data extracted from image');
            mathpixData.text = 'No clear text detected in this image. The image may be blank, blurry, or contain content that is difficult to recognize.';
            mathpixData.confidence = 0.1;
        }

        console.log('🎉 Image processing completed successfully!');

        return {
            mathpixResponse: mathpixData,
            id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            processingTime: `${(processingTime / 1000).toFixed(1)} seconds`,
            confidence: mathpixData.confidence
        };

    } catch (error) {
        throw new Error(`Image processing failed: ${error.message}`);
    }
};

// Generate extraction statistics
function generateExtractionStats(questions) {
    const stats = {
        total_questions: questions.length,
        question_types: {},
        questions_with_options: 0,
        questions_without_options: 0,
        average_options_per_question: 0,
        problematic_questions: []
    };
    
    let totalOptions = 0;
    
    questions.forEach((q, index) => {
        const type = q.type || 'unknown';
        stats.question_types[type] = (stats.question_types[type] || 0) + 1;
        
        if (q.options && q.options.length > 0) {
            const nonEmptyOptions = q.options.filter(opt => opt.trim().length > 0);
            if (nonEmptyOptions.length > 0) {
                stats.questions_with_options++;
                totalOptions += nonEmptyOptions.length;
                
                if (q.type === 'multiple_choice' && nonEmptyOptions.length < 4) {
                    stats.problematic_questions.push({
                        questionNumber: q.questionNumber || index + 1,
                        issue: 'incomplete_options',
                        optionCount: nonEmptyOptions.length
                    });
                }
            } else {
                stats.questions_without_options++;
            }
        } else {
            stats.questions_without_options++;
        }
        
        if (q.question.length < 20) {
            stats.problematic_questions.push({
                questionNumber: q.questionNumber || index + 1,
                issue: 'very_short_question',
                length: q.question.length
            });
        }
    });
    
    stats.average_options_per_question = stats.questions_with_options > 0 
        ? (totalOptions / stats.questions_with_options).toFixed(1)
        : 0;
    
    return stats;
}

const upload = async (req, res) => {
    const uploadedFile = req.file;
    const startTime = Date.now();
    
    console.log('\n🚀 === UPLOAD PROCESSING STARTED ===');
    
    if (!uploadedFile) {
        return res.status(400).json({
            success: false,
            message: "No file uploaded"
        });
    }
    
    try {
        let result;
        let fileType;
        
        const maxSizeBytes = 50 * 1024 * 1024; // 50MB
        if (uploadedFile.size > maxSizeBytes) {
            throw new Error(`File too large. Maximum size is ${maxSizeBytes / (1024 * 1024)}MB`);
        }
        
        if (uploadedFile.size === 0) {
            throw new Error('Empty file uploaded');
        }

        if (!process.env.MATHPIX_API_ID || !process.env.MATHPIX_API_KEY) {
            throw new Error('Mathpix API credentials not configured');
        }
        
        if (uploadedFile.mimetype === 'application/pdf') {
            fileType = 'pdf';
            result = await processPDF(uploadedFile);
        } else if (isImageFile(uploadedFile.mimetype)) {
            fileType = 'image';
            result = await processImage(uploadedFile);
        } else {
            throw new Error(`Unsupported file type: ${uploadedFile.mimetype}`);
        }
        
        // Clean up uploaded file immediately
        if (uploadedFile.path && fs.existsSync(uploadedFile.path)) {
            try {
                fs.rmSync(uploadedFile.path);
                console.log('🧹 Temporary file cleaned up');
            } catch (cleanupError) {
                console.warn('⚠️ Could not clean up uploaded file:', cleanupError.message);
            }
        }
        
        debugMathpixExtraction(result.mathpixResponse);
        
        let extractedQuestions = [];
        try {
            extractedQuestions = extractQuestionsFromMathpix(result.mathpixResponse, true);
        } catch (extractionError) {
            console.error('❌ Question extraction failed:', extractionError.message);
        }
        
        const extractionStats = generateExtractionStats(extractedQuestions);
        const totalTime = Date.now() - startTime;
        
        const transformedQuestions = extractedQuestions.map(q => ({
            question: q.question,
            diagram: q.diagram,
            options: q.options || []
        }));
        
        return res.status(200).json({
            success: true,
            message: `${fileType.toUpperCase()} processed and ${extractedQuestions.length} questions extracted successfully`,
            data: {
                file_type: fileType,
                pdf_id: result.id,
                total_questions: extractedQuestions.length,
                questions: transformedQuestions,
                processing_time: `${(totalTime / 1000).toFixed(1)} seconds`,
                original_filename: uploadedFile.originalname,
                detailed_info: (req.query.debug === 'true' || (req.body && req.body.debug === true)) ? {
                    file_info: {
                        type: fileType,
                        original_filename: uploadedFile.originalname,
                        file_size: uploadedFile.size,
                        mime_type: uploadedFile.mimetype
                    },
                    processing_info: {
                        mathpix_id: result.id,
                        mathpix_processing_time: result.processingTime,
                        total_processing_time: `${(totalTime / 1000).toFixed(1)} seconds`,
                        attempts: result.attempts || 1,
                        confidence: result.confidence || null
                    },
                    enhanced_questions: extractedQuestions,
                    extraction_stats: extractionStats,
                    quality_indicators: {
                        has_mathematical_symbols: extractedQuestions.some(q => q.question.includes('<') || q.question.includes('>')),
                        questions_with_math_symbols: extractedQuestions.filter(q => q.question.includes('<') || q.question.includes('>')).length,
                        average_confidence: result.confidence || null,
                        extraction_method_used: 'mathpix_basic_compatible'
                    }
                } : undefined
            }
        });
        
    } catch (error) {
        const totalTime = Date.now() - startTime;
        
        if (uploadedFile && uploadedFile.path && fs.existsSync(uploadedFile.path)) {
            try {
                fs.rmSync(uploadedFile.path);
            } catch (cleanupError) {
                console.error('❌ Cleanup failed:', cleanupError.message);
            }
        }
        
        return res.status(500).json({
            success: false,
            message: "Failed to process file",
            error: {
                type: error.constructor ? error.constructor.name : 'UnknownError',
                message: error.message
            },
            data: {
                total_questions: 0,
                questions: [],
                processing_time: `${(totalTime / 1000).toFixed(1)} seconds`
            },
            file_info: uploadedFile ? {
                original_filename: uploadedFile.originalname,
                mime_type: uploadedFile.mimetype,
                file_size: uploadedFile.size
            } : null
        });
    }
};

module.exports = {
    upload
};
