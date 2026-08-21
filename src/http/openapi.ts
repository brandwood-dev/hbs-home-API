import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";
import type { Environment } from "../config/environment.js";
import { API_VERSION, CONTRACT_VERSION, SERVICE_NAME } from "../constants.js";

export async function registerOpenApi(
  app: FastifyInstance,
  environment: Environment,
): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "HBS HOME API",
        description:
          "Canonical HTTP contract for the HBS HOME public and administration applications.",
        version: CONTRACT_VERSION,
      },
      servers: [
        { url: environment.apiPublicUrl, description: environment.nodeEnv },
      ],
      tags: [
        { name: "system", description: "Service health and release metadata." },
        {
          name: "admin-identity",
          description: "Authenticated Admin identity, roles and MFA state.",
        },
        {
          name: "admin-audit",
          description: "Immutable security and business audit events.",
        },
        {
          name: "admin-orders",
          description:
            "Persisted customer orders for the authenticated Admin back-office.",
        },
        {
          name: "catalog",
          description: "Public catalog browsing and recommendations.",
        },
        {
          name: "admin-inventory",
          description:
            "Authenticated stock balances, movements and transactional reservations.",
        },
        {
          name: "cart",
          description:
            "Opaque-token guest cart, authoritative prices and single-code promotions.",
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description:
              "Supabase Auth access token. Admin mutations require an aal2 MFA session.",
          },
        },
      },
      externalDocs: {
        description: `${SERVICE_NAME} ${API_VERSION} contract roadmap`,
        url: "https://github.com/brandwood-dev/hbs-home-API",
      },
    },
    refResolver: {
      buildLocalReference(schema, _baseUri, _fragment, index) {
        return typeof schema.$id === "string"
          ? schema.$id
          : `schema-${String(index)}`;
      },
    },
  });

  if (environment.docsEnabled) {
    await app.register(swaggerUi, {
      routePrefix: "/documentation",
      uiConfig: {
        docExpansion: "list",
        deepLinking: true,
      },
      staticCSP: true,
    });
  }
}
