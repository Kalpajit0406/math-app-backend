# OCR Refactor & Stabilization Tracking

This file tracks changes, diagnostic findings, and next steps for the OCR pipeline refactor.

## March 21, 2026 — Initial actions

- Added `ImagePreprocessor` (`src/services/imagePreprocessor.js`): preprocessBuffer(buffer) using `sharp` (auto-orient, resize, grayscale, normalize, sharpen, trim, jpeg compression). Returns diagnostics and qualityRating.
- Integrated `ImagePreprocessor` into `OCRPipeline.runFromBuffer` to run preprocessing before Mathpix.
- Fixed LaTeX sanitizer bug in `src/services/ocrPipeline.js` to correctly assign results from brace/dollar balancing functions.

## Findings so far

- `MathpixService` already implements retry/backoff and basic timeout. Current 60s timeout may still cause UX issues — consider converting to async job processing or reducing synchronous wait with background processing.
- `LatexSanitizer` previously did not apply returned balanced strings; fixed.
- No image preprocessing was performed previously — this caused many OCR noise issues.

## Next planned steps

1. Hardening `QuestionSegmenter` boundary rules (prevent cross-question leakage). — completed
2. Improve `MCQOptionParser` to enforce option boundaries and multi-line options safely. — completed (new robust line-based parser added)
3. Add OCRNormalizer layer to clean Mathpix text before segmentation. — completed (`src/services/ocrNormalizer.js`)
4. Improve `LatexSanitizer` with token-level repairs (balanced braces/dollars, bracket balancing, symbol normalization, frac repair). — completed (`src/services/ocrPipeline.js` updates)
4. Add queue persistence (Redis or DB-backed) and background processing for large PDFs.
5. Add observability: structured logs, tracing IDs, and metrics for per-question confidence.

If another agent continues work, please update this file after each completed step.

## March 21, 2026 — Queue + CI hardening

- Added persistent OCR queue model: `src/models/ocrJobModel.js`.
- Added queue service: `src/services/ocrQueueService.js` with enqueue/get/mark transitions.
- Added async OCR worker: `src/workers/ocrWorker.js`.
- Added async enqueue in controller (`?async=true`) and polling endpoint support (`GET /ocr/jobs/:jobId`).
- Fixed queue bug: incorrect `$inc` usage in `markProcessing`.
- Added storage optimization: remove original image buffer from job after completion.
- Added parser tests: `test/ocr_parser.test.js` using `node:test`.
- Added CI workflow: `.github/workflows/ci.yml`.
- Fixed OCRNormalizer merge logic so question boundaries/options are not merged into previous lines.
- Verified local tests pass: `npm test` -> 2/2 passing.
