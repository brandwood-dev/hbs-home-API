import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AuditRepository } from "../audit/audit-repository.js";
import {
  createAdminGuard,
  type AdminGuardDependencies,
  type AdminPrincipal,
} from "../auth/admin-guard.js";
import type {
  AdminCustomerListParams,
  CustomerMergeInput,
  CustomerSort,
  CustomerUpdateInput,
  PostgresAdminCustomerRepository,
} from "../customers/admin-customer-repository.js";
import { ProblemDetailSchema } from "../http/problem.js";
import { AdminOrder } from "./admin-orders.js";

const IdParams = Type.Object(
  { id: Type.String({ format: "uuid" }) },
  { additionalProperties: false },
);
const AddressParams = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    addressId: Type.String({ format: "uuid" }),
  },
  { additionalProperties: false },
);
const CustomerAddress = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    label: Type.Optional(Type.String()),
    governorate: Type.String(),
    city: Type.String(),
    postalCode: Type.Optional(Type.String()),
    addressLine: Type.String(),
    landmark: Type.Optional(Type.String()),
    isDefault: Type.Optional(Type.Boolean()),
    createdAt: Type.Optional(Type.String({ format: "date-time" })),
    updatedAt: Type.Optional(Type.String({ format: "date-time" })),
  },
  { additionalProperties: false },
);
const CustomerNote = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    text: Type.String(),
    createdAt: Type.String({ format: "date-time" }),
    userId: Type.Optional(Type.String({ format: "uuid" })),
    userName: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
const Customer = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    firstName: Type.String(),
    lastName: Type.String(),
    phone: Type.String(),
    email: Type.Optional(Type.String()),
    governorate: Type.String(),
    tags: Type.Array(Type.String()),
    internalNotes: Type.String(),
    addresses: Type.Array(CustomerAddress),
    createdAt: Type.String({ format: "date-time" }),
    notes: Type.Optional(Type.Array(CustomerNote)),
    preferredChannel: Type.Optional(
      Type.Union([
        Type.Literal("phone"),
        Type.Literal("email"),
        Type.Literal("whatsapp"),
      ]),
    ),
    mergedIntoCustomerId: Type.Optional(Type.String({ format: "uuid" })),
    mergedAt: Type.Optional(Type.String({ format: "date-time" })),
    updatedAt: Type.Optional(Type.String({ format: "date-time" })),
  },
  { additionalProperties: false },
);
const CustomerMetrics = Type.Object(
  {
    totalOrders: Type.Integer({ minimum: 0 }),
    deliveredOrders: Type.Integer({ minimum: 0 }),
    totalSpentMinor: Type.Integer({ minimum: 0 }),
    averageOrderValueMinor: Type.Integer({ minimum: 0 }),
    firstOrderAt: Type.Optional(Type.String({ format: "date-time" })),
    lastOrderAt: Type.Optional(Type.String({ format: "date-time" })),
    cancelledOrders: Type.Integer({ minimum: 0 }),
    returnedOrders: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
const CustomerRow = Type.Intersect([
  Customer,
  Type.Object({
    metrics: CustomerMetrics,
    hasPotentialDuplicate: Type.Boolean(),
  }),
]);
const CustomerDetail = Type.Intersect([
  CustomerRow,
  Type.Object({
    orders: Type.Array(AdminOrder),
    duplicates: Type.Array(Customer),
  }),
]);
const CustomerListResponse = Type.Object(
  {
    items: Type.Array(CustomerRow),
    total: Type.Integer({ minimum: 0 }),
    page: Type.Integer({ minimum: 1 }),
    pageSize: Type.Integer({ minimum: 1 }),
    pageCount: Type.Integer({ minimum: 1 }),
    governorates: Type.Array(Type.String()),
    tags: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
const CustomerSort = Type.Union([
  Type.Literal("last_order"),
  Type.Literal("name_asc"),
  Type.Literal("spent_desc"),
  Type.Literal("orders_desc"),
  Type.Literal("aov_desc"),
]);
const ListQuery = Type.Object(
  {
    page: Type.Optional(Type.Integer({ minimum: 1, maximum: 10_000 })),
    pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    governorate: Type.Optional(Type.String({ maxLength: 120 })),
    hasOrders: Type.Optional(Type.Boolean()),
    hasDeliveredOrders: Type.Optional(Type.Boolean()),
    minSpentMinor: Type.Optional(Type.Integer({ minimum: 0 })),
    tags: Type.Optional(Type.String({ maxLength: 2_000 })),
    lastOrderFrom: Type.Optional(Type.String({ format: "date-time" })),
    lastOrderTo: Type.Optional(Type.String({ format: "date-time" })),
    onlyPotentialDuplicates: Type.Optional(Type.Boolean()),
    sort: Type.Optional(CustomerSort),
    q: Type.Optional(Type.String({ maxLength: 160 })),
  },
  { additionalProperties: false },
);
const UpdateBody = Type.Object(
  {
    firstName: Type.Optional(Type.String({ minLength: 2, maxLength: 60 })),
    lastName: Type.Optional(Type.String({ minLength: 2, maxLength: 60 })),
    phone: Type.Optional(Type.String({ minLength: 8, maxLength: 20 })),
    email: Type.Optional(
      Type.Union([Type.String({ maxLength: 255 }), Type.Null()]),
    ),
    governorate: Type.Optional(Type.String({ maxLength: 120 })),
    internalNotes: Type.Optional(Type.String({ maxLength: 10_000 })),
    preferredChannel: Type.Optional(
      Type.Union([
        Type.Literal("phone"),
        Type.Literal("email"),
        Type.Literal("whatsapp"),
        Type.Null(),
      ]),
    ),
  },
  { additionalProperties: false },
);
const AddressBody = Type.Object(
  {
    label: Type.Optional(
      Type.Union([Type.String({ maxLength: 80 }), Type.Null()]),
    ),
    governorate: Type.String({ minLength: 1, maxLength: 120 }),
    city: Type.String({ minLength: 1, maxLength: 120 }),
    postalCode: Type.Optional(
      Type.Union([Type.String({ maxLength: 20 }), Type.Null()]),
    ),
    addressLine: Type.String({ minLength: 1, maxLength: 240 }),
    landmark: Type.Optional(
      Type.Union([Type.String({ maxLength: 160 }), Type.Null()]),
    ),
    isDefault: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
const TagsBody = Type.Object(
  { tags: Type.Array(Type.String({ maxLength: 60 }), { maxItems: 30 }) },
  { additionalProperties: false },
);
const NoteBody = Type.Object(
  { text: Type.String({ minLength: 1, maxLength: 2_000 }) },
  { additionalProperties: false },
);
const MergeBody = Type.Object(
  {
    primaryCustomerId: Type.String({ format: "uuid" }),
    secondaryCustomerId: Type.String({ format: "uuid" }),
    keepPhoneFrom: Type.Optional(
      Type.Union([Type.Literal("primary"), Type.Literal("secondary")]),
    ),
    keepEmailFrom: Type.Optional(
      Type.Union([Type.Literal("primary"), Type.Literal("secondary")]),
    ),
  },
  { additionalProperties: false },
);
type ListQueryType = Static<typeof ListQuery>;
type UpdateBodyType = Static<typeof UpdateBody>;
type AddressBodyType = Static<typeof AddressBody>;
type TagsBodyType = Static<typeof TagsBody>;
type NoteBodyType = Static<typeof NoteBody>;
type MergeBodyType = Static<typeof MergeBody>;

export interface AdminCustomerRouteDependencies extends AdminGuardDependencies {
  adminCustomerRepository: PostgresAdminCustomerRepository;
  auditRepository: AuditRepository;
}

function actor(request: FastifyRequest): AdminPrincipal {
  if (!request.adminPrincipal)
    throw new Error("Admin guard did not set a principal.");
  return request.adminPrincipal;
}

async function audit(
  dependencies: AdminCustomerRouteDependencies,
  request: FastifyRequest,
  action: string,
  resourceId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const current = actor(request);
  await dependencies.auditRepository.append({
    requestId: request.id,
    actorUserId: current.userId,
    actorEmail: current.email,
    action,
    resourceType: "customer",
    resourceId,
    outcome: "success",
    sourceIp: request.ip,
    userAgent: request.headers["user-agent"]?.toString() ?? null,
    metadata,
  });
}

function listParams(query: ListQueryType): AdminCustomerListParams {
  return {
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20,
    sort: query.sort ?? "last_order",
    ...(query.governorate ? { governorates: [query.governorate] } : {}),
    ...(query.hasOrders === undefined ? {} : { hasOrders: query.hasOrders }),
    ...(query.hasDeliveredOrders === undefined
      ? {}
      : { hasDeliveredOrders: query.hasDeliveredOrders }),
    ...(query.minSpentMinor === undefined
      ? {}
      : { minSpentMinor: query.minSpentMinor }),
    ...(query.tags
      ? {
          tags: query.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        }
      : {}),
    ...(query.lastOrderFrom ? { lastOrderFrom: query.lastOrderFrom } : {}),
    ...(query.lastOrderTo ? { lastOrderTo: query.lastOrderTo } : {}),
    ...(query.onlyPotentialDuplicates === undefined
      ? {}
      : { onlyPotentialDuplicates: query.onlyPotentialDuplicates }),
    ...(query.q ? { search: query.q } : {}),
  };
}

export function registerAdminCustomerRoutes(
  app: FastifyInstance,
  dependencies: AdminCustomerRouteDependencies,
): void {
  app.get<{ Querystring: ListQueryType }>(
    "/api/v1/admin/customers",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["customers.read"],
      }),
      schema: {
        operationId: "listAdminCustomers",
        summary: "List persisted customer profiles",
        tags: ["admin-customers"],
        security: [{ bearerAuth: [] }],
        querystring: ListQuery,
        response: {
          200: CustomerListResponse,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
        },
      },
    },
    async (request) =>
      dependencies.adminCustomerRepository.list(listParams(request.query)),
  );

  app.get<{ Params: Static<typeof IdParams> }>(
    "/api/v1/admin/customers/:id",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["customers.read"],
      }),
      schema: {
        operationId: "getAdminCustomer",
        summary: "Read a persisted customer profile",
        tags: ["admin-customers"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        response: {
          200: CustomerDetail,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await dependencies.adminCustomerRepository.getById(
        request.params.id,
      );
      return (
        result ??
        reply.status(404).send({
          type: "https://api.hbs-home.com/problems/customer-not-found",
          title: "Customer not found",
          status: 404,
          detail: "The requested customer does not exist.",
          instance: request.url,
          code: "CUSTOMER_NOT_FOUND",
          requestId: request.id,
        })
      );
    },
  );

  app.patch<{ Params: Static<typeof IdParams>; Body: UpdateBodyType }>(
    "/api/v1/admin/customers/:id",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["customers.write"],
      }),
      schema: {
        operationId: "updateAdminCustomer",
        summary: "Update a customer profile",
        tags: ["admin-customers"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        body: UpdateBody,
        response: {
          200: Customer,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const input: CustomerUpdateInput = request.body;
      const result = await dependencies.adminCustomerRepository.update(
        request.params.id,
        input,
      );
      await audit(dependencies, request, "customer.updated", result.id);
      return result;
    },
  );

  app.post<{ Params: Static<typeof IdParams>; Body: AddressBodyType }>(
    "/api/v1/admin/customers/:id/addresses",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["customers.write"],
      }),
      schema: {
        operationId: "addAdminCustomerAddress",
        summary: "Add a customer address",
        tags: ["admin-customers"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        body: AddressBody,
        response: {
          200: Customer,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const result = await dependencies.adminCustomerRepository.addAddress(
        request.params.id,
        request.body,
      );
      await audit(
        dependencies,
        request,
        "customer.address_added",
        request.params.id,
      );
      return result;
    },
  );

  app.patch<{ Params: Static<typeof AddressParams>; Body: AddressBodyType }>(
    "/api/v1/admin/customers/:id/addresses/:addressId",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["customers.write"],
      }),
      schema: {
        operationId: "updateAdminCustomerAddress",
        summary: "Update a customer address",
        tags: ["admin-customers"],
        security: [{ bearerAuth: [] }],
        params: AddressParams,
        body: AddressBody,
        response: {
          200: Customer,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const result = await dependencies.adminCustomerRepository.updateAddress(
        request.params.id,
        request.params.addressId,
        request.body,
      );
      await audit(
        dependencies,
        request,
        "customer.address_updated",
        request.params.id,
      );
      return result;
    },
  );

  app.delete<{ Params: Static<typeof AddressParams> }>(
    "/api/v1/admin/customers/:id/addresses/:addressId",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["customers.write"],
      }),
      schema: {
        operationId: "deleteAdminCustomerAddress",
        summary: "Delete a customer address",
        tags: ["admin-customers"],
        security: [{ bearerAuth: [] }],
        params: AddressParams,
        response: {
          200: Customer,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const result = await dependencies.adminCustomerRepository.deleteAddress(
        request.params.id,
        request.params.addressId,
      );
      await audit(
        dependencies,
        request,
        "customer.address_deleted",
        request.params.id,
      );
      return result;
    },
  );

  app.post<{ Params: Static<typeof AddressParams> }>(
    "/api/v1/admin/customers/:id/addresses/:addressId/default",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["customers.write"],
      }),
      schema: {
        operationId: "setAdminCustomerDefaultAddress",
        summary: "Set a customer's default address",
        tags: ["admin-customers"],
        security: [{ bearerAuth: [] }],
        params: AddressParams,
        response: {
          200: Customer,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const result =
        await dependencies.adminCustomerRepository.setDefaultAddress(
          request.params.id,
          request.params.addressId,
        );
      await audit(
        dependencies,
        request,
        "customer.address_default_set",
        request.params.id,
      );
      return result;
    },
  );

  app.patch<{ Params: Static<typeof IdParams>; Body: TagsBodyType }>(
    "/api/v1/admin/customers/:id/tags",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["customers.write"],
      }),
      schema: {
        operationId: "updateAdminCustomerTags",
        summary: "Update customer tags",
        tags: ["admin-customers"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        body: TagsBody,
        response: {
          200: Customer,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const result = await dependencies.adminCustomerRepository.updateTags(
        request.params.id,
        request.body.tags,
      );
      await audit(
        dependencies,
        request,
        "customer.tags_updated",
        request.params.id,
      );
      return result;
    },
  );

  app.post<{ Params: Static<typeof IdParams>; Body: NoteBodyType }>(
    "/api/v1/admin/customers/:id/notes",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["customers.write"],
      }),
      schema: {
        operationId: "addAdminCustomerNote",
        summary: "Add an internal customer note",
        tags: ["admin-customers"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        body: NoteBody,
        response: {
          200: Customer,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const current = actor(request);
      const result = await dependencies.adminCustomerRepository.addNote(
        request.params.id,
        request.body.text,
        current.userId,
        current.displayName ?? current.email,
      );
      await audit(
        dependencies,
        request,
        "customer.note_added",
        request.params.id,
      );
      return result;
    },
  );

  app.get<{ Params: Static<typeof IdParams> }>(
    "/api/v1/admin/customers/:id/duplicates",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["customers.read"],
      }),
      schema: {
        operationId: "findAdminCustomerDuplicates",
        summary: "Find potential duplicate customers",
        tags: ["admin-customers"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        response: {
          200: Type.Array(Customer),
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request) =>
      dependencies.adminCustomerRepository.findPotentialDuplicates(
        request.params.id,
      ),
  );

  app.post<{ Body: MergeBodyType }>(
    "/api/v1/admin/customers/merge",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["customers.merge"],
      }),
      schema: {
        operationId: "mergeAdminCustomers",
        summary: "Merge two customer profiles",
        tags: ["admin-customers"],
        security: [{ bearerAuth: [] }],
        body: MergeBody,
        response: {
          200: CustomerDetail,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const input: CustomerMergeInput = request.body;
      const result = await dependencies.adminCustomerRepository.merge(input);
      await audit(dependencies, request, "customer.merged", result.id, {
        secondaryCustomerId: input.secondaryCustomerId,
      });
      return result;
    },
  );
}
