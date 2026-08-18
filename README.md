# HBS HOME API

Modular backend for the HBS HOME public storefront and administration application.

## Phase 2 scope

The API now provides the secure identity foundation used by HBS HOME Admin:

- Supabase JWT verification through the project's rotating JWKS;
- database-backed Admin profiles, roles and granular permissions;
- mandatory TOTP MFA (`aal2`) for sensitive Admin endpoints;
- private `iam` and `audit` PostgreSQL schemas;
- least-privilege `hbs_api` database role, RLS and explicit grants;
- public product media plus private quote/import Storage buckets;
- append-only security audit events;
- an operator-only invitation command for the first Admin.

Business catalogue, inventory, customer and order data remain mocked until their dedicated phases.

Protected endpoints:

```text
GET /api/v1/admin/session
GET /api/v1/admin/audit-events
```

## Phase 1 foundation

This first phase provides only the API foundation:

- strict environment configuration;
- structured and redacted logging;
- request correlation IDs;
- security and CORS middleware;
- standardized problem responses;
- liveness, readiness, and version endpoints;
- generated OpenAPI 3.1 contract;
- unit and integration tests.

No catalogue, inventory, customer, or order business behavior is implemented yet.

## Phase 0 delivery foundation

The repository also includes the delivery platform required before domain work:

- a non-root, multi-stage Docker image;
- a Render staging Blueprint for `api-preview.hbs-home.com`;
- a Supabase CLI project with an immutable migration baseline;
- CI quality, database-rebuild, and container-build jobs;
- an external smoke test that verifies the deployed Git SHA.

## Requirements

- Node.js 24 or newer supported LTS runtime;
- Bun 1.3.14.

## Local commands

```bash
cp .env.example .env
bun install
bun run dev
```

Validation:

```bash
bun run openapi:generate
bun run check
bun run db:start
bun run db:reset
bun run db:lint
bun run db:test
bun run db:stop
bun run db:provision-api-role
bun run docker:build
```

Docker Desktop (or another Docker-compatible runtime) is required for the database and image commands. The local Supabase stack is development-only and must never be exposed publicly.

Endpoints:

```text
GET /health/live
GET /health/ready
GET /api/v1/version
GET /api/v1/admin/session
GET /api/v1/admin/audit-events
GET /documentation
```

Interactive documentation is disabled by default when `NODE_ENV=production`.

## Contract policy

The runtime schemas generate `openapi/openapi.json`. A stale committed contract fails `bun run openapi:check`.

Every later domain phase follows this order:

1. contract and error cases;
2. tests;
3. business implementation;
4. frontend client regeneration;
5. end-to-end validation.

## Git policy

Work through Pull Requests and preserve published history. Do not force-push or rewrite commits already synchronized with connected tools.
