import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { AuditRepository } from "../audit/audit-repository.js";
import {
  createAdminGuard,
  type AdminGuardDependencies,
  type AdminPrincipal,
} from "../auth/admin-guard.js";
import { type InventoryRepository } from "../inventory/inventory-repository.js";
import { ProblemDetailSchema } from "../http/problem.js";

const VariantParams = Type.Object(
  { variantId: Type.String({ minLength: 1, maxLength: 160 }) },
  { additionalProperties: false },
);
const Availability = Type.Union([
  Type.Literal("in_stock"),
  Type.Literal("low_stock"),
  Type.Literal("out_of_stock"),
  Type.Literal("made_to_order"),
]);
const InventoryVariantSchema = Type.Object(
  {
    id: Type.String(),
    sku: Type.String(),
    colorId: Type.String(),
    colorLabel: Type.String(),
    widthCm: Type.Integer({ minimum: 0 }),
    heightCm: Type.Integer({ minimum: 0 }),
    curtainHeader: Type.String(),
    eyeletColor: Type.Optional(Type.String()),
    lining: Type.Optional(Type.String()),
    priceMinor: Type.Integer({ minimum: 0 }),
    compareAtPriceMinor: Type.Optional(Type.Integer({ minimum: 0 })),
    stock: Type.Integer({ minimum: 0 }),
    reserved: Type.Integer({ minimum: 0 }),
    lowStockThreshold: Type.Integer({ minimum: 0 }),
    availability: Availability,
    imageUrl: Type.Optional(Type.String()),
    isActive: Type.Boolean(),
    isDefault: Type.Boolean(),
    options: Type.Record(
      Type.String(),
      Type.Union([Type.String(), Type.Number()]),
    ),
    packQuantity: Type.Optional(Type.Integer({ minimum: 1 })),
    trackInventory: Type.Boolean(),
  },
  { $id: "AdminInventoryVariant", additionalProperties: false },
);
const InventoryRowSchema = Type.Object(
  {
    productId: Type.String(),
    productName: Type.String(),
    categoryId: Type.String(),
    variant: InventoryVariantSchema,
    updatedAt: Type.String({ format: "date-time" }),
  },
  { $id: "AdminInventoryRow", additionalProperties: false },
);
const InventoryResponseSchema = Type.Object(
  { items: Type.Array(InventoryRowSchema) },
  { $id: "AdminInventoryResponse", additionalProperties: false },
);
const MovementSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    variantId: Type.String(),
    productId: Type.String(),
    type: Type.Union([
      Type.Literal("increase"),
      Type.Literal("decrease"),
      Type.Literal("set"),
    ]),
    quantity: Type.Integer({ minimum: 1 }),
    reason: Type.String(),
    note: Type.Optional(Type.String()),
    previousStock: Type.Optional(Type.Integer({ minimum: 0 })),
    resultingStock: Type.Optional(Type.Integer({ minimum: 0 })),
    createdAt: Type.String({ format: "date-time" }),
    userId: Type.Optional(Type.String({ format: "uuid" })),
  },
  { $id: "AdminStockMovement", additionalProperties: false },
);
const MovementsResponseSchema = Type.Object(
  { items: Type.Array(MovementSchema) },
  { $id: "AdminStockMovementsResponse", additionalProperties: false },
);
const AdjustmentBody = Type.Object(
  {
    productId: Type.String({ minLength: 1, maxLength: 160 }),
    variantId: Type.String({ minLength: 1, maxLength: 160 }),
    type: Type.Union([
      Type.Literal("increase"),
      Type.Literal("decrease"),
      Type.Literal("set"),
    ]),
    quantity: Type.Integer({ minimum: 0 }),
    reason: Type.Union([
      Type.Literal("purchase"),
      Type.Literal("sale_correction"),
      Type.Literal("customer_return"),
      Type.Literal("damaged"),
      Type.Literal("inventory_correction"),
      Type.Literal("manual_adjustment"),
      Type.Literal("other"),
    ]),
    note: Type.Optional(Type.String({ maxLength: 500 })),
    lowStockThreshold: Type.Optional(Type.Integer({ minimum: 0 })),
    availability: Type.Optional(Availability),
  },
  { additionalProperties: false },
);
const SettingsBody = Type.Object(
  {
    productId: Type.String({ minLength: 1, maxLength: 160 }),
    lowStockThreshold: Type.Integer({ minimum: 0 }),
    availability: Type.Optional(Availability),
  },
  { additionalProperties: false },
);

type AdjustmentBodyType = Static<typeof AdjustmentBody>;
type SettingsBodyType = Static<typeof SettingsBody>;

export interface AdminInventoryRouteDependencies extends AdminGuardDependencies {
  inventoryRepository: InventoryRepository;
  auditRepository: AuditRepository;
}

function principal(request: {
  adminPrincipal: AdminPrincipal | null;
}): AdminPrincipal {
  if (!request.adminPrincipal)
    throw new Error("Admin guard did not set a principal.");
  return request.adminPrincipal;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.trim();
}

export function registerAdminInventoryRoutes(
  app: FastifyInstance,
  dependencies: AdminInventoryRouteDependencies,
): void {
  app.addSchema(InventoryVariantSchema);
  app.addSchema(InventoryRowSchema);
  app.addSchema(InventoryResponseSchema);
  app.addSchema(MovementSchema);
  app.addSchema(MovementsResponseSchema);
  app.get(
    "/api/v1/admin/inventory",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: false,
        permissions: ["inventory.read"],
      }),
      schema: {
        operationId: "adminListInventory",
        tags: ["admin-inventory"],
        security: [{ bearerAuth: [] }],
        response: {
          200: InventoryResponseSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
        },
      },
    },
    async () => ({ items: await dependencies.inventoryRepository.list() }),
  );

  app.get<{ Querystring: { variantId?: string } }>(
    "/api/v1/admin/inventory/movements",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: false,
        permissions: ["inventory.read"],
      }),
      schema: {
        operationId: "adminListStockMovements",
        tags: ["admin-inventory"],
        security: [{ bearerAuth: [] }],
        querystring: Type.Object(
          {
            variantId: Type.Optional(
              Type.String({ minLength: 1, maxLength: 160 }),
            ),
          },
          { additionalProperties: false },
        ),
        response: {
          200: MovementsResponseSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
        },
      },
    },
    async (request) => ({
      items: await dependencies.inventoryRepository.movements(
        request.query.variantId,
      ),
    }),
  );

  app.post<{ Body: AdjustmentBodyType }>(
    "/api/v1/admin/inventory/adjustments",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["inventory.adjust"],
      }),
      schema: {
        operationId: "adminAdjustInventory",
        tags: ["admin-inventory"],
        security: [{ bearerAuth: [] }],
        body: AdjustmentBody,
        response: {
          200: InventoryRowSchema,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const actor = principal(request);
      const operationKey =
        headerValue(request.headers["idempotency-key"]) ?? request.id;
      const item = await dependencies.inventoryRepository.adjust({
        ...request.body,
        operationKey,
        actorUserId: actor.userId,
      });
      await dependencies.auditRepository.append({
        requestId: request.id,
        actorUserId: actor.userId,
        actorEmail: actor.email,
        action: "inventory.adjusted",
        resourceType: "inventory_variant",
        resourceId: request.body.variantId,
        outcome: "success",
        sourceIp: request.ip,
        userAgent: headerValue(request.headers["user-agent"]) ?? null,
        metadata: {
          productId: request.body.productId,
          type: request.body.type,
          quantity: request.body.quantity,
          reason: request.body.reason,
          operationKey,
        },
      });
      return item;
    },
  );

  app.patch<{
    Params: Static<typeof VariantParams>;
    Body: SettingsBodyType;
  }>(
    "/api/v1/admin/inventory/:variantId",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["inventory.adjust"],
      }),
      schema: {
        operationId: "adminUpdateInventorySettings",
        tags: ["admin-inventory"],
        security: [{ bearerAuth: [] }],
        params: VariantParams,
        body: SettingsBody,
        response: {
          200: InventoryRowSchema,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const actor = principal(request);
      const item = await dependencies.inventoryRepository.updateSettings({
        ...request.body,
        variantId: request.params.variantId,
      });
      await dependencies.auditRepository.append({
        requestId: request.id,
        actorUserId: actor.userId,
        actorEmail: actor.email,
        action: "inventory.settings_updated",
        resourceType: "inventory_variant",
        resourceId: request.params.variantId,
        outcome: "success",
        sourceIp: request.ip,
        userAgent: headerValue(request.headers["user-agent"]) ?? null,
        metadata: { productId: request.body.productId },
      });
      return item;
    },
  );
}
