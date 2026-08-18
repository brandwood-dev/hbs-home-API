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
  it("documents every Phase 1 endpoint with a stable operation ID", async () => {
    const document = await createOpenApiDocument();
    expect(Object.keys(document.paths).sort()).toEqual([
      "/api/v1/version",
      "/health/live",
      "/health/ready",
    ]);

    const operationIds = collectOperationIds(document);
    expect(operationIds.sort()).toEqual([
      "getLiveness",
      "getReadiness",
      "getVersion",
    ]);
    expect(new Set(operationIds).size).toBe(operationIds.length);
  });

  it("publishes reusable response and problem schemas", async () => {
    const document = await createOpenApiDocument();
    const schemas = document.components?.schemas;
    expect(schemas).toBeDefined();
    if (!schemas) throw new Error("OpenAPI components.schemas is required.");
    expect(Object.keys(schemas).sort()).toEqual([
      "HealthResponse",
      "ProblemDetail",
      "ReadinessResponse",
      "VersionResponse",
    ]);
  });
});
