import type { OpenAPIV3 } from "openapi-types";
import { describe, expect, it } from "vitest";
import { createOpenApiDocument } from "../scripts/openapi-document.js";

const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;

function collectOperationIds(document: OpenAPIV3.Document): string[] {
  const operationIds: string[] = [];
  for (const pathItem of Object.values(document.paths)) {
    if (!pathItem) continue;
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (operation?.operationId) operationIds.push(operation.operationId);
    }
  }
  return operationIds;
}

describe("OpenAPI contract", () => {
  it("documents every implemented endpoint with a stable operation ID", async () => {
    const document = await createOpenApiDocument();
    expect(Object.keys(document.paths).sort()).toEqual([
      "/api/v1/admin/audit-events",
      "/api/v1/admin/session",
      "/api/v1/products",
      "/api/v1/products/by-ids",
      "/api/v1/products/scope",
      "/api/v1/products/{slug}",
      "/api/v1/products/{slug}/related",
      "/api/v1/version",
      "/health/live",
      "/health/ready",
    ]);

    const operationIds = collectOperationIds(document);
    expect(operationIds.sort()).toEqual([
      "getAdminSession",
      "getLiveness",
      "getProductBySlug",
      "getReadiness",
      "getRelatedProducts",
      "getVersion",
      "listAuditEvents",
      "listCatalogScopeProducts",
      "listProducts",
      "listProductsByIds",
    ]);
    expect(new Set(operationIds).size).toBe(operationIds.length);
  });

  it("publishes reusable response and problem schemas", async () => {
    const document = await createOpenApiDocument();
    const schemas = document.components?.schemas;
    expect(schemas).toBeDefined();
    if (!schemas) throw new Error("OpenAPI components.schemas is required.");
    expect(Object.keys(schemas).sort()).toEqual([
      "AdminSession",
      "AuditEvent",
      "AuditListResponse",
      "HealthResponse",
      "ProblemDetail",
      "ReadinessResponse",
      "ReadinessUnavailableResponse",
      "VersionResponse",
    ]);
  });
});
