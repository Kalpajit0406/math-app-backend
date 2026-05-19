# Gemini Handoff: What to Do Next

## Goal
Continue the backend hardening and quality pass with small, verifiable changes.

## Priority Order
1. **Security first**
   - Review all auth-sensitive endpoints in `src/routes` + `src/controllers` for missing auth/role middleware.
   - Verify no hardcoded secrets, tokens, or fallback credentials remain.
   - Tighten input validation for request bodies used in auth, exam creation, and scan endpoints.

2. **Stability and correctness**
   - Add/expand route-level and service-level error handling where unhandled promise failures can still leak 500s.
   - Validate MongoDB queries that use user-provided IDs to ensure consistent ObjectId validation.
   - Confirm retry/fallback logic in DB connection flow behaves correctly when SRV DNS fails.

3. **OCR/AI pipeline improvements**
   - Review scan flow (`/api/v1/scan`) for timeout handling, payload size limits, and malformed image input.
   - Ensure Mathpix/Gemini responses are sanitized before persistence or client response.
   - Add deterministic fallback behavior for partially parsed OCR output.

4. **Performance and maintainability**
   - Audit indexes used by high-traffic reads (attempt history, exam listing, announcements).
   - Remove duplicate/legacy code paths where dual model logic is no longer required.
   - Improve logging clarity for auth failures and OCR processing errors.

## Suggested Execution Plan
- [ ] Baseline: run existing checks and document current failures.
- [ ] Security pass on auth + protected routes.
- [ ] Validation pass on OCR endpoints and payload constraints.
- [ ] Data/query safety pass (ObjectId + query guards).
- [ ] Performance pass (indexes and hot paths).
- [ ] Final regression run and short changelog update.

## Notes
- Keep changes surgical and isolated per PR.
- Prefer fixing one subsystem at a time (auth, OCR, DB, then perf).
- If adding dependencies, run vulnerability checks before merging.
