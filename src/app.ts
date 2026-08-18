import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify, {
  LogController,
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";
import { randomUUID } from "node:crypto";
import { loadEnvironment, type Environment } from "./config/environment.js";
import { registerErrorHandling } from "./http/error-handler.js";
import { registerOpenApi } from "./http/openapi.js";
import { ProblemDetailSchema } from "./http/problem.js";
import {
  HealthResponseSchema,
  ReadinessResponseSchema,
  VersionResponseSchema,
} from "./http/schemas.js";
import { registerSystemRoutes } from "./routes/system.js";

export interface BuildAppOptions {
  environment?: Environment;
  logger?: FastifyServerOptions["logger"];
}

function requestIdFromHeader(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate && /^[A-Za-z0-9._:-]{1,128}$/.test(candidate)) return candidate;
  return randomUUID();
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const environment = options.environment ?? loadEnvironment();
  const app = Fastify({
    logger:
      options.logger ??
      (environment.logLevel === "silent"
        ? false
        : {
            level: environment.logLevel,
            redact: {
              paths: [
                "req.headers.authorization",
                "req.headers.cookie",
                "res.headers.set-cookie",
              ],
              censor: "[REDACTED]",
            },
          }),
    genReqId: (request) => requestIdFromHeader(request.headers["x-request-id"]),
    logController: new LogController({ disableRequestLogging: false }),
    trustProxy: true,
  });

  app.addSchema(ProblemDetailSchema);
  app.addSchema(HealthResponseSchema);
  app.addSchema(ReadinessResponseSchema);
  app.addSchema(VersionResponseSchema);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: environment.corsOrigins,
    credentials: true,
  });
  await registerOpenApi(app, environment);

  app.addHook("onSend", async (request, reply) => {
    void reply.header("x-request-id", request.id);
  });

  registerErrorHandling(app);
  registerSystemRoutes(app, environment);

  await app.ready();
  return app;
}
