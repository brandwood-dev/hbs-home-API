import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnvironment } from "../src/config/environment.js";
import {
  FakeAdminAccessRepository,
  FakeAuditRepository,
  FakeDatabaseConnection,
  FakeJwtVerifier,
} from "./support/fakes.js";

const environment = loadEnvironment({
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: "3000",
  LOG_LEVEL: "silent",
  CORS_ORIGINS: "http://localhost:3001",
  DOCS_ENABLED: "true",
  API_PUBLIC_URL: "http://localhost:3000",
  RELEASE_VERSION: "0.2.0-test",
  GIT_SHA: "test-sha",
  BUILD_TIME: "2026-08-18T00:00:00.000Z",
});

describe("HBS HOME API foundation", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({
      environment,
      logger: false,
      database: new FakeDatabaseConnection(),
      jwtVerifier: new FakeJwtVerifier(),
      adminAccessRepository: new FakeAdminAccessRepository(),
      auditRepository: new FakeAuditRepository(),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("reports liveness and propagates a trusted request ID", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health/live",
      headers: { "x-request-id": "acceptance-test-1" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-request-id"]).toBe("acceptance-test-1");
    expect(response.json()).toMatchObject({
      status: "ok",
      service: "hbs-home-api",
    });
  });

  it("replaces an unsafe request ID", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health/live",
      headers: { "x-request-id": "unsafe value with spaces" },
    });
    expect(response.headers["x-request-id"]).not.toBe(
      "unsafe value with spaces",
    );
  });

  it("reports readiness", async () => {
    const response = await app.inject({ method: "GET", url: "/health/ready" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ready",
      checks: { application: "up", database: "up" },
    });
  });

  it("reports release and contract versions", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/version",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: "hbs-home-api",
      apiVersion: "v1",
      contractVersion: "1.1.0",
      releaseVersion: "0.2.0-test",
      gitSha: "test-sha",
      builtAt: "2026-08-18T00:00:00.000Z",
      environment: "test",
    });
  });

  it("returns RFC 9457-style problem details for unknown routes", async () => {
    const response = await app.inject({ method: "GET", url: "/missing" });
    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      instance: "/missing",
    });
  });

  it("serves interactive documentation outside production", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/documentation/json",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      openapi: "3.1.0",
      info: { title: "HBS HOME API", version: "1.1.0" },
    });
  });

  it("fails readiness when PostgreSQL is unavailable", async () => {
    await app.close();
    const database = new FakeDatabaseConnection(false);
    app = await buildApp({
      environment,
      logger: false,
      database,
      jwtVerifier: new FakeJwtVerifier(),
      adminAccessRepository: new FakeAdminAccessRepository(),
      auditRepository: new FakeAuditRepository(),
    });

    const response = await app.inject({ method: "GET", url: "/health/ready" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: "not_ready",
      checks: { application: "up", database: "down" },
    });
  });
});
