import type { FastifyInstance } from "fastify";
import type { Environment } from "../config/environment.js";
import type { DatabaseConnection } from "../database/connection.js";
import { API_VERSION, CONTRACT_VERSION, SERVICE_NAME } from "../constants.js";
import {
  HealthResponseSchema,
  ReadinessResponseSchema,
  ReadinessUnavailableResponseSchema,
  VersionResponseSchema,
  type HealthResponse,
  type ReadinessResponse,
  type ReadinessUnavailableResponse,
  type VersionResponse,
} from "../http/schemas.js";

export function registerSystemRoutes(
  app: FastifyInstance,
  environment: Environment,
  database: DatabaseConnection,
): void {
  app.get<{ Reply: HealthResponse }>(
    "/health/live",
    {
      schema: {
        operationId: "getLiveness",
        summary: "Check whether the API process is alive",
        tags: ["system"],
        response: { 200: HealthResponseSchema },
      },
    },
    () => ({
      status: "ok",
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
      uptimeSeconds: process.uptime(),
    }),
  );

  app.get<{ Reply: ReadinessResponse | ReadinessUnavailableResponse }>(
    "/health/ready",
    {
      schema: {
        operationId: "getReadiness",
        summary: "Check whether the API can receive traffic",
        tags: ["system"],
        response: {
          200: ReadinessResponseSchema,
          503: ReadinessUnavailableResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const databaseReady = await database.checkHealth();
      if (!databaseReady) {
        return reply.status(503).send({
          status: "not_ready",
          service: SERVICE_NAME,
          timestamp: new Date().toISOString(),
          checks: { application: "up", database: "down" },
        });
      }

      return {
        status: "ready",
        service: SERVICE_NAME,
        timestamp: new Date().toISOString(),
        checks: { application: "up", database: "up" },
      };
    },
  );

  app.get<{ Reply: VersionResponse }>(
    "/api/v1/version",
    {
      schema: {
        operationId: "getVersion",
        summary: "Return the deployed release and contract versions",
        tags: ["system"],
        response: { 200: VersionResponseSchema },
      },
    },
    () => ({
      service: SERVICE_NAME,
      apiVersion: API_VERSION,
      contractVersion: CONTRACT_VERSION,
      releaseVersion: environment.releaseVersion,
      gitSha: environment.gitSha,
      builtAt: environment.buildTime,
      environment: environment.nodeEnv,
    }),
  );
}
