# AGENTS.md

Scope: This file guides AI coding agents working in this repository.

## Fast Start
- Install deps: `npm install`
- Run dev server: `npm run dev`
- Run tests: `npm test`
- Seed teacher account: `npm run seed:teacher`
- Optimize indexes and audit DB: `npm run optimize:db`

## Project Shape
- Server entry and middleware stack: [src/server.js](src/server.js)
- Database config and failover connection logic: [src/config/db.js](src/config/db.js)
- HTTP layer: [src/routes](src/routes)
- Controllers: [src/controllers](src/controllers)
- Services (OCR, uploads, parsing): [src/services](src/services)
- Background workers: [src/workers](src/workers)
- Models: [src/models](src/models)

## Core Rules
- Keep changes surgical. Do not rewrite stable API surfaces without migration intent.
- Preserve authentication, authorization, and input validation paths.
- Maintain sanitization for OCR and LaTeX processing paths.
- Preserve rate limiting and security middleware unless explicitly asked to adjust policy.
- If changing DB access patterns, verify index implications and query performance.

## Known Pitfalls
- Missing environment variables cause hard-to-trace runtime failures; always verify `.env` requirements.
- OCR queue and worker logic are sensitive to retry and stale-job edge cases.
- Test flows may rely on seeded users and expected credentials.
- MongoDB pool and connection options can affect latency and stability under load.

## Read Before Large Changes
- Setup, routes, and architecture overview: [README.md](README.md)
- Environment template and required vars: [.env.example](.env.example)
- API collection examples: [postman_collection.json](postman_collection.json)

## Custom Agents
- Specialized test-system auditor: [.github/agents/TEST-SYSTEM-ARCHITECT.agent.md](.github/agents/TEST-SYSTEM-ARCHITECT.agent.md)

## Output Expectations For Agents
- State audited or changed scope first.
- For reviews, report findings ordered by severity.
- Include test and verification commands run, plus residual risks.
