# OpenAPI contract

`openapi.json` is the generated and versioned HTTP contract for implemented API routes.

- Generate it with `bun run openapi:generate`.
- Verify drift with `bun run openapi:check`.
- Phase 1 intentionally contains only the implemented system endpoints.
- Each later vertical slice must add its contract before its business implementation.

The frontend stores a synchronized snapshot and generates its TypeScript client types from it.
