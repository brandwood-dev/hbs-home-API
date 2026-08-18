import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerErrorHandling } from "../src/http/error-handler.js";
import { AppError } from "../src/http/problem.js";

describe("standardized API errors", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    registerErrorHandling(app);

    app.get(
      "/validation",
      {
        schema: {
          querystring: {
            type: "object",
            required: ["requiredValue"],
            properties: { requiredValue: { type: "string" } },
          },
        },
      },
      () => ({ status: "ok" }),
    );

    app.get("/application", () => {
      throw new AppError({
        statusCode: 409,
        code: "CONFLICT",
        title: "Business conflict",
        detail: "The requested transition is not allowed.",
      });
    });

    app.get("/unexpected", () => {
      throw new Error("database-password-must-never-leak");
    });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("normalizes request validation failures", async () => {
    const response = await app.inject({ method: "GET", url: "/validation" });

    expect(response.statusCode).toBe(400);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      instance: "/validation",
      errors: [{ keyword: "required" }],
    });
  });

  it("normalizes explicit application errors", async () => {
    const response = await app.inject({ method: "GET", url: "/application" });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      status: 409,
      code: "CONFLICT",
      detail: "The requested transition is not allowed.",
    });
  });

  it("hides internal error details from clients", async () => {
    const response = await app.inject({ method: "GET", url: "/unexpected" });

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("database-password-must-never-leak");
    expect(response.json()).toMatchObject({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      detail: "An unexpected error occurred.",
    });
  });
});
