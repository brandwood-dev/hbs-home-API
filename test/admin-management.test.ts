import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnvironment } from "../src/config/environment.js";
import type {
  AdminManagedUser,
  AdminManagementRepository,
} from "../src/identity/admin-management-repository.js";
import {
  FakeAdminAccessRepository,
  FakeAuditRepository,
  FakeDatabaseConnection,
  FakeJwtVerifier,
} from "./support/fakes.js";

const actorId = "11111111-1111-4111-8111-111111111111";
const targetId = "22222222-2222-4222-8222-222222222222";
const environment = loadEnvironment({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  CORS_ORIGINS: "http://localhost:3001",
  DOCS_ENABLED: "false",
});

function user(id: string, roles: string[] = []): AdminManagedUser {
  return {
    id,
    email: `${id.slice(0, 8)}@example.com`,
    displayName: "Équipe HBS HOME",
    status: "revoked",
    createdAt: new Date(0).toISOString(),
    lastSeenAt: null,
    roles,
  };
}

describe("Admin team member removal", () => {
  let app: FastifyInstance;
  let jwtVerifier: FakeJwtVerifier;
  let accessRepository: FakeAdminAccessRepository;
  let auditRepository: FakeAuditRepository;
  let removeMember: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    jwtVerifier = new FakeJwtVerifier();
    accessRepository = new FakeAdminAccessRepository();
    auditRepository = new FakeAuditRepository();
    removeMember = vi.fn(() => Promise.resolve(user(targetId)));
    const adminManagementRepository = {
      removeMember,
    } as unknown as AdminManagementRepository;
    app = await buildApp({
      environment,
      logger: false,
      database: new FakeDatabaseConnection(),
      jwtVerifier,
      adminAccessRepository: accessRepository,
      auditRepository,
      adminManagementRepository,
    });
  });

  afterEach(async () => app.close());

  function authorize(roles: string[]): void {
    jwtVerifier.add("valid-token", {
      userId: actorId,
      email: "admin@example.com",
      assuranceLevel: "aal2",
      sessionId: "33333333-3333-4333-8333-333333333333",
    });
    accessRepository.set({
      userId: actorId,
      email: "admin@example.com",
      displayName: "HBS HOME Admin",
      status: "active",
      roles,
      permissions: ["users.manage"],
    });
  }

  it("allows only a Super Admin to remove a member", async () => {
    authorize(["content_editor"]);
    const response = await app.inject({
      method: "DELETE",
      url: `/api/v1/admin/users/${targetId}`,
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "SUPER_ADMIN_REQUIRED" });
    expect(removeMember).not.toHaveBeenCalled();
  });

  it("does not allow a Super Admin to remove its own account", async () => {
    authorize(["super_admin"]);
    const response = await app.inject({
      method: "DELETE",
      url: `/api/v1/admin/users/${actorId}`,
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "SELF_ADMIN_DELETE" });
    expect(removeMember).not.toHaveBeenCalled();
  });

  it("revokes the member and records an audit event", async () => {
    authorize(["super_admin"]);
    const response = await app.inject({
      method: "DELETE",
      url: `/api/v1/admin/users/${targetId}`,
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: targetId, status: "revoked" });
    expect(removeMember).toHaveBeenCalledWith(targetId, actorId);
    expect(auditRepository.events).toContainEqual(
      expect.objectContaining({
        action: "admin_user.removed",
        resourceId: targetId,
        outcome: "success",
      }),
    );
  });
});
