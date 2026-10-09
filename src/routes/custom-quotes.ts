import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AuditRepository } from "../audit/audit-repository.js";
import {
  createAdminGuard,
  type AdminGuardDependencies,
  type AdminPrincipal,
} from "../auth/admin-guard.js";
import type { DatabaseConnection } from "../database/connection.js";
import { ProblemDetailSchema } from "../http/problem.js";
import type { PostgresCustomQuoteRepository } from "../quotes/custom-quote-repository.js";

const ProductType = Type.Union([
  Type.Literal("rideaux"),
  Type.Literal("voilages"),
  Type.Literal("stores"),
  Type.Literal("ensemble_fenetre"),
]);
const PreferredContact = Type.Union([
  Type.Literal("phone"),
  Type.Literal("whatsapp"),
  Type.Literal("email"),
]);
const Opening = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 80 }),
    label: Type.String({ minLength: 1, maxLength: 120 }),
    openingType: Type.String({ minLength: 1, maxLength: 80 }),
    widthCm: Type.Number({ exclusiveMinimum: 0, maximum: 20_000 }),
    heightCm: Type.Number({ exclusiveMinimum: 0, maximum: 20_000 }),
    quantity: Type.Integer({ minimum: 1, maximum: 1_000 }),
    installationType: Type.Optional(Type.String({ maxLength: 120 })),
  },
  { additionalProperties: false },
);
const Preferences = Type.Object(
  {
    wantsAccessories: Type.Boolean(),
    notes: Type.Optional(Type.String({ maxLength: 5_000 })),
  },
  { additionalProperties: false },
);
const Contact = Type.Object(
  {
    firstName: Type.String({ minLength: 2, maxLength: 60 }),
    lastName: Type.String({ minLength: 2, maxLength: 60 }),
    phone: Type.String({ minLength: 8, maxLength: 20 }),
    email: Type.Optional(Type.String({ format: "email", maxLength: 255 })),
    governorate: Type.String({ minLength: 1, maxLength: 120 }),
    city: Type.String({ minLength: 2, maxLength: 120 }),
    preferredContact: PreferredContact,
  },
  { additionalProperties: false },
);
const AttachmentMetadata = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 160 }),
    name: Type.String({ minLength: 1, maxLength: 255 }),
    size: Type.Integer({ minimum: 0, maximum: 25_000_000 }),
    type: Type.String({ maxLength: 120 }),
  },
  { additionalProperties: false },
);
const CreateBody = Type.Object(
  {
    productType: ProductType,
    openings: Type.Array(Opening, { minItems: 1, maxItems: 30 }),
    preferences: Preferences,
    contact: Contact,
    attachmentMetadata: Type.Array(AttachmentMetadata, { maxItems: 10 }),
    acceptedPrivacy: Type.Literal(true),
  },
  { additionalProperties: false },
);
type CreateBodyType = Static<typeof CreateBody>;

const QuoteResponse = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    reference: Type.String(),
    productType: ProductType,
    openings: Type.Array(Type.Unknown()),
    preferences: Type.Record(Type.String(), Type.Unknown()),
    contact: Type.Object(
      {
        firstName: Type.String(),
        lastName: Type.String(),
        phone: Type.String(),
        email: Type.Optional(Type.String()),
        governorate: Type.String(),
        city: Type.String(),
        preferredContact: PreferredContact,
      },
      { additionalProperties: false },
    ),
    attachmentMetadata: Type.Array(Type.Record(Type.String(), Type.Unknown())),
    acceptedPrivacy: Type.Literal(true),
    createdAt: Type.String({ format: "date-time" }),
    readAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    archivedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    emailSentAt: Type.Union([
      Type.String({ format: "date-time" }),
      Type.Null(),
    ]),
  },
  { $id: "CustomQuoteRequest", additionalProperties: false },
);
const QuoteListResponse = Type.Object(
  {
    items: Type.Array(QuoteResponse),
    total: Type.Integer({ minimum: 0 }),
    unread: Type.Integer({ minimum: 0 }),
    page: Type.Integer({ minimum: 1 }),
    pageSize: Type.Integer({ minimum: 1 }),
    pageCount: Type.Integer({ minimum: 1 }),
  },
  { $id: "CustomQuoteListResponse", additionalProperties: false },
);
const IdParams = Type.Object(
  { id: Type.String({ format: "uuid" }) },
  { additionalProperties: false },
);
const ListQuery = Type.Object(
  {
    page: Type.Optional(Type.Integer({ minimum: 1, maximum: 10_000 })),
    pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    q: Type.Optional(Type.String({ maxLength: 160 })),
    unreadOnly: Type.Optional(Type.Boolean()),
    includeArchived: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
type ListQueryType = Static<typeof ListQuery>;

export interface CustomQuoteRouteDependencies extends AdminGuardDependencies {
  database: DatabaseConnection;
  auditRepository: AuditRepository;
  customQuoteRepository: PostgresCustomQuoteRepository;
}

function principal(request: FastifyRequest): AdminPrincipal {
  if (!request.adminPrincipal)
    throw new Error("Admin guard did not set a principal.");
  return request.adminPrincipal;
}

async function audit(
  dependencies: CustomQuoteRouteDependencies,
  request: FastifyRequest,
  action: string,
  resourceId: string,
): Promise<void> {
  const current = principal(request);
  await dependencies.auditRepository.append({
    requestId: request.id,
    actorUserId: current.userId,
    actorEmail: current.email,
    action,
    resourceType: "custom_quote",
    resourceId,
    outcome: "success",
    sourceIp: request.ip,
    userAgent: request.headers["user-agent"]?.toString() ?? null,
    metadata: {},
  });
}

export function registerCustomQuoteRoutes(
  app: FastifyInstance,
  dependencies: CustomQuoteRouteDependencies,
): void {
  app.addSchema(QuoteResponse);
  app.addSchema(QuoteListResponse);

  app.post<{ Body: CreateBodyType }>(
    "/api/v1/custom-quotes",
    {
      schema: {
        operationId: "createCustomQuote",
        summary: "Submit a custom measurement quote request",
        tags: ["custom-quotes"],
        body: CreateBody,
        response: { 201: QuoteResponse, 400: ProblemDetailSchema },
      },
    },
    async (request, reply) => {
      if (
        request.body.contact.preferredContact === "email" &&
        !request.body.contact.email
      ) {
        return reply.status(400).send({
          type: "https://api.hbs-home.com/problems/invalid-custom-quote",
          title: "Invalid contact details",
          status: 400,
          detail:
            "An email address is required when email is the preferred contact method.",
          instance: request.url,
          code: "QUOTE_EMAIL_REQUIRED",
          requestId: request.id,
        });
      }
      const result = await dependencies.customQuoteRepository.create(
        request.body,
      );
      return reply.status(201).send(result);
    },
  );

  app.get<{ Querystring: ListQueryType }>(
    "/api/v1/admin/custom-quotes",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["quotes.read"],
      }),
      schema: {
        operationId: "listAdminCustomQuotes",
        summary: "List custom quote requests",
        tags: ["admin-custom-quotes"],
        security: [{ bearerAuth: [] }],
        querystring: ListQuery,
        response: {
          200: QuoteListResponse,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
        },
      },
    },
    async (request) =>
      dependencies.customQuoteRepository.list({
        page: request.query.page ?? 1,
        pageSize: request.query.pageSize ?? 20,
        ...(request.query.q ? { query: request.query.q } : {}),
        ...(request.query.unreadOnly !== undefined
          ? { unreadOnly: request.query.unreadOnly }
          : {}),
        ...(request.query.includeArchived !== undefined
          ? { includeArchived: request.query.includeArchived }
          : {}),
      }),
  );

  app.get<{ Params: Static<typeof IdParams> }>(
    "/api/v1/admin/custom-quotes/:id",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        permissions: ["quotes.read"],
      }),
      schema: {
        operationId: "getAdminCustomQuote",
        summary: "Read one custom quote request",
        tags: ["admin-custom-quotes"],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        response: {
          200: QuoteResponse,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
          404: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await dependencies.customQuoteRepository.getById(
        request.params.id,
      );
      return (
        result ??
        reply.status(404).send({
          type: "https://api.hbs-home.com/problems/quote-not-found",
          title: "Demande introuvable",
          status: 404,
          detail: "La demande de devis demandée n'existe pas.",
          instance: request.url,
          code: "QUOTE_NOT_FOUND",
          requestId: request.id,
        })
      );
    },
  );

  for (const [suffix, action, summary, method] of [
    [
      "read",
      "custom_quote.read",
      "Mark a custom quote request as read",
      "markRead",
    ],
    [
      "archive",
      "custom_quote.archived",
      "Archive a custom quote request",
      "archive",
    ],
  ] as const) {
    app.patch<{ Params: Static<typeof IdParams> }>(
      `/api/v1/admin/custom-quotes/:id/${suffix}`,
      {
        preHandler: createAdminGuard(dependencies, {
          requireMfa: true,
          permissions: ["quotes.write"],
        }),
        schema: {
          operationId: `${suffix}AdminCustomQuote`,
          summary,
          tags: ["admin-custom-quotes"],
          security: [{ bearerAuth: [] }],
          params: IdParams,
          response: {
            200: QuoteResponse,
            401: ProblemDetailSchema,
            403: ProblemDetailSchema,
            404: ProblemDetailSchema,
          },
        },
      },
      async (request) => {
        const result = await dependencies.customQuoteRepository[method](
          request.params.id,
        );
        await audit(dependencies, request, action, result.id);
        return result;
      },
    );
  }
}
