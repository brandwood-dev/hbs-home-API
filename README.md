# HBS HOME API

Modular backend for the HBS HOME public storefront and administration application.

## Current scope (Phase 5B)

The API now provides the secure identity foundation used by HBS HOME Admin:

- Supabase JWT verification through the project's rotating JWKS;
- database-backed Admin profiles, roles and granular permissions;
- mandatory TOTP MFA (`aal2`) for sensitive Admin endpoints;
- private `iam` and `audit` PostgreSQL schemas;
- least-privilege `hbs_api` database role, RLS and explicit grants;
- public product media plus private quote/import Storage buckets;
- append-only security audit events;
- an operator-only invitation command for the first Admin.
- Admin catalogue CRUD for categories, typed attributes and products;
- variant management with integer TND pricing and SKU uniqueness;
- explicit draft, publish and archive transitions;
- MFA-protected mutations, granular RBAC and append-only mutation audits;
- optimistic product version checks and synchronization with the public JSONB read model.
- opaque-token guest carts with server-side price, availability and shipping recalculation;
- one-code V1 promotion evaluation (the redemption counter is consumed by checkout in Phase 6).
- MFA-protected Admin promotion CRUD with RBAC, deactivation and audit events;

Checkout/order creation, customer profiles and Brevo workflows remain in their dedicated phases.
Adding to a cart never reserves stock.

Public cart endpoints:

```text
GET /api/v1/cart
POST /api/v1/cart/items
PATCH /api/v1/cart/items/:lineId
DELETE /api/v1/cart/items/:lineId
DELETE /api/v1/cart
POST /api/v1/cart/promotion
DELETE /api/v1/cart/promotion
```

Protected endpoints:

```text
GET /api/v1/admin/session
GET /api/v1/admin/audit-events
GET /api/v1/admin/categories
POST /api/v1/admin/categories
PATCH /api/v1/admin/categories/:id
GET /api/v1/admin/attributes
POST /api/v1/admin/attributes
PATCH /api/v1/admin/attributes/:id
GET /api/v1/admin/products
POST /api/v1/admin/products
GET /api/v1/admin/products/:id
PATCH /api/v1/admin/products/:id
POST /api/v1/admin/products/:id/publish
POST /api/v1/admin/products/:id/archive
POST /api/v1/admin/products/:id/variants
PATCH /api/v1/admin/products/:productId/variants/:variantId
POST /api/v1/admin/products/:productId/variants/:variantId/archive
GET /api/v1/admin/promotions
POST /api/v1/admin/promotions
GET /api/v1/admin/promotions/:id
PATCH /api/v1/admin/promotions/:id
POST /api/v1/admin/promotions/:id/archive
GET /api/v1/admin/media
POST /api/v1/admin/media
PATCH /api/v1/admin/media/:id
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

Inventory is implemented through Phase 4. Checkout and customer/order business behavior remains
in the subsequent phases.

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
GET /api/v1/admin/categories
GET /api/v1/admin/attributes
GET /api/v1/admin/products
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
