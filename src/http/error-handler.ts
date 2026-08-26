import type { FastifyError, FastifyInstance, FastifyRequest } from "fastify";
import { AppError, type ProblemDetail } from "./problem.js";

function problemInstance(request: FastifyRequest): string {
  return request.url.split("?", 1)[0] ?? request.url;
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    const problem: ProblemDetail = {
      type: "https://api.hbs-home.com/problems/not-found",
      title: "Resource not found",
      status: 404,
      detail: "The requested resource does not exist.",
      instance: problemInstance(request),
      code: "NOT_FOUND",
      requestId: request.id,
    };

    return reply.type("application/problem+json").status(404).send(problem);
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      const problem: ProblemDetail = {
        type: "https://api.hbs-home.com/problems/payload-too-large",
        title: "Payload too large",
        status: 413,
        detail: "The uploaded image must not exceed 8 MiB.",
        instance: problemInstance(request),
        code: "MEDIA_PAYLOAD_TOO_LARGE",
        requestId: request.id,
      };
      return reply.type("application/problem+json").status(413).send(problem);
    }
    if (error.validation) {
      const problem: ProblemDetail = {
        type: "https://api.hbs-home.com/problems/validation-error",
        title: "Validation failed",
        status: 400,
        detail: "The request does not match the expected contract.",
        instance: problemInstance(request),
        code: "VALIDATION_ERROR",
        requestId: request.id,
        errors: error.validation.map((item) => ({
          path: item.instancePath || "/",
          message: item.message ?? "Invalid value.",
          keyword: item.keyword,
        })),
      };
      return reply.type("application/problem+json").status(400).send(problem);
    }

    if (error instanceof AppError) {
      const problem: ProblemDetail = {
        type: error.type,
        title: error.title,
        status: error.statusCode,
        detail: error.message,
        instance: problemInstance(request),
        code: error.code,
        requestId: request.id,
      };
      return reply
        .type("application/problem+json")
        .status(error.statusCode)
        .send(problem);
    }

    request.log.error({ err: error }, "Unhandled request error");
    const problem: ProblemDetail = {
      type: "https://api.hbs-home.com/problems/internal-server-error",
      title: "Internal server error",
      status: 500,
      detail: "An unexpected error occurred.",
      instance: problemInstance(request),
      code: "INTERNAL_SERVER_ERROR",
      requestId: request.id,
    };
    return reply.type("application/problem+json").status(500).send(problem);
  });
}
