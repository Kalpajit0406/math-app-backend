# Architecture Audit

## Scope
This audit covers the Flutter student app, Flutter admin app, and Node.js backend as one connected education platform, with the reference implementation anchored at [MathsWsd-frontend-main](/home/kalpajit/MathswithSD/MathsWsd-frontend-main) and [mathswithsd-backend-main](/home/kalpajit/MathswithSD/mathswithsd-backend-main).

## Current Architecture Snapshot

### Student App
- Entry point: `mathswithsd/lib/main.dart`
- Core layers: UI screens, `ChangeNotifier` providers, API/storage services, offline exam persistence
- Main flows: authentication, scheduled test loading, exam attempt lifecycle, result rendering, local resume support

### Admin App
- Entry point: `mathswithsd_admin/lib/main.dart`
- Core layers: admin screens, question/admin providers, API and image services, queue UI, LaTeX rendering
- Main flows: student verification, OCR upload, question queue review, test creation, announcement management

### Backend
- Entry point: `math-app-backend/src/server.js`
- Core layers: routes, controllers, services, middleware, models, worker processes
- Main flows: auth, exams, attempts, OCR scan/queue, PDF handling, analytics, health probes

### Reference Trees
- Frontend reference: Astro + React hybrid app with teacher/student pages, upload flow, KaTeX rendering, and client-side queue UI.
- Backend reference: TypeScript + Express app with upload, question, test config, student, time, and test response routes.

## High-Risk System Boundaries

### OCR Pipeline
- Uploads are preprocessed server-side before OCR execution
- OCR output is normalized, segmented, and parsed into questions/options
- Queue persistence exists, but segmentation correctness is the most critical quality gate

### Exam Flow
- Student exam state is split between provider memory and local persistence
- Submission and timer handling need strict atomicity to avoid answer or time loss

### Verification Flow
- Admin question verification is queue-driven and should remain isolated per question block
- Queue state needs durable recovery across refreshes and network failure

## Confirmed Risks
- Hardcoded teacher login bypass was present in backend auth code
- OCR segmentation must be validated against merged-question and option-leakage cases
- Student exam flows still require a deeper review for reconnect and submission race conditions
- Backend visibility and logging need a clearer checkpoint trail for long refactors

## Audit Rule Going Forward
Do not change working flows unless the change is necessary to restore correctness, stability, security, or recoverability.