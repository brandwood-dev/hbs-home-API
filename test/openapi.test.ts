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
      "/api/v1/admin/attributes",
      "/api/v1/admin/attributes/{id}",
      "/api/v1/admin/audit-events",
      "/api/v1/admin/categories",
      "/api/v1/admin/categories/{id}",
      "/api/v1/admin/inventory",
      "/api/v1/admin/inventory/adjustments",
      "/api/v1/admin/inventory/movements",
      "/api/v1/admin/inventory/reservations",
      "/api/v1/admin/inventory/reservations/expire",
      "/api/v1/admin/inventory/reservations/{reservationId}",
      "/api/v1/admin/inventory/reservations/{reservationId}/release",
      "/api/v1/admin/inventory/{variantId}",
      "/api/v1/admin/products",
      "/api/v1/admin/products/{id}",
      "/api/v1/admin/products/{id}/archive",
      "/api/v1/admin/products/{id}/publish",
      "/api/v1/admin/products/{id}/variants",
      "/api/v1/admin/products/{productId}/variants/{variantId}",
      "/api/v1/admin/products/{productId}/variants/{variantId}/archive",
      "/api/v1/admin/promotions",
      "/api/v1/admin/promotions/{id}",
      "/api/v1/admin/promotions/{id}/archive",
      "/api/v1/admin/session",
      "/api/v1/cart",
      "/api/v1/cart/items",
      "/api/v1/cart/items/{lineId}",
      "/api/v1/cart/promotion",
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
      "addCartItem",
      "adminAdjustInventory",
      "adminArchiveProduct",
      "adminArchivePromotion",
      "adminArchiveVariant",
      "adminCreateAttribute",
      "adminCreateCategory",
      "adminCreateInventoryReservation",
      "adminCreateProduct",
      "adminCreatePromotion",
      "adminCreateVariant",
      "adminExpireInventoryReservations",
      "adminGetInventoryReservation",
      "adminGetProduct",
      "adminGetPromotion",
      "adminListAttributes",
      "adminListCategories",
      "adminListInventory",
      "adminListProducts",
      "adminListPromotions",
      "adminListStockMovements",
      "adminPublishProduct",
      "adminReleaseInventoryReservation",
      "adminUpdateAttribute",
      "adminUpdateCategory",
      "adminUpdateInventorySettings",
      "adminUpdateProduct",
      "adminUpdatePromotion",
      "adminUpdateVariant",
      "applyCartPromotion",
      "clearCart",
      "getAdminSession",
      "getCart",
      "getLiveness",
      "getProductBySlug",
      "getReadiness",
      "getRelatedProducts",
      "getVersion",
      "listAuditEvents",
      "listCatalogScopeProducts",
      "listProducts",
      "listProductsByIds",
      "removeCartItem",
      "removeCartPromotion",
      "updateCartItem",
    ]);
    expect(new Set(operationIds).size).toBe(operationIds.length);
  });

  it("publishes reusable response and problem schemas", async () => {
    const document = await createOpenApiDocument();
    const schemas = document.components?.schemas;
    expect(schemas).toBeDefined();
    if (!schemas) throw new Error("OpenAPI components.schemas is required.");
    expect(Object.keys(schemas).sort()).toEqual([
      "AdminAttribute",
      "AdminAttributeOption",
      "AdminAttributesResponse",
      "AdminCategoriesResponse",
      "AdminCategory",
      "AdminInventoryResponse",
      "AdminInventoryRow",
      "AdminInventoryVariant",
      "AdminProduct",
      "AdminProductMedia",
      "AdminProductVariant",
      "AdminProductsResponse",
      "AdminPromotion",
      "AdminPromotionsResponse",
      "AdminSession",
      "AdminStockMovement",
      "AdminStockMovementsResponse",
      "AuditEvent",
      "AuditListResponse",
      "Cart",
      "CartLine",
      "HealthResponse",
      "ProblemDetail",
      "ReadinessResponse",
      "ReadinessUnavailableResponse",
      "ReservationExpiryResponse",
      "StockReservation",
      "VersionResponse",
    ]);
  });
});
