import type { Kysely } from "kysely";
import type {
  AuditEventInput,
  AuditEventRecord,
  AuditRepository,
} from "../../src/audit/audit-repository.js";
import {
  InvalidAccessTokenError,
  type JwtVerifier,
  type VerifiedAuthToken,
} from "../../src/auth/jwt-verifier.js";
import type { DatabaseConnection } from "../../src/database/connection.js";
import type { DatabaseSchema } from "../../src/database/schema.js";
import type {
  AdminAccess,
  AdminAccessRepository,
} from "../../src/identity/admin-access.js";

export class FakeDatabaseConnection implements DatabaseConnection {
  readonly client = undefined as unknown as Kysely<DatabaseSchema>;

  constructor(private healthy = true) {}

  checkHealth(): Promise<boolean> {
    return Promise.resolve(this.healthy);
  }

  destroy(): Promise<void> {
    return Promise.resolve();
  }

  setHealthy(healthy: boolean): void {
    this.healthy = healthy;
  }
}

export class FakeJwtVerifier implements JwtVerifier {
  private readonly tokens = new Map<string, VerifiedAuthToken>();

  add(token: string, claims: VerifiedAuthToken): void {
    this.tokens.set(token, claims);
  }

  verify(token: string): Promise<VerifiedAuthToken> {
    const claims = this.tokens.get(token);
    if (!claims) {
      return Promise.reject(new InvalidAccessTokenError("Invalid test token."));
    }
    return Promise.resolve(claims);
  }
}

export class FakeAdminAccessRepository implements AdminAccessRepository {
  private readonly accessByUserId = new Map<string, AdminAccess>();
  readonly lastSeen = new Set<string>();

  set(access: AdminAccess): void {
    this.accessByUserId.set(access.userId, access);
  }

  findByUserId(userId: string): Promise<AdminAccess | null> {
    return Promise.resolve(this.accessByUserId.get(userId) ?? null);
  }

  markLastSeen(userId: string): Promise<void> {
    this.lastSeen.add(userId);
    return Promise.resolve();
  }
}

export class FakeAuditRepository implements AuditRepository {
  readonly events: AuditEventInput[] = [];

  append(event: AuditEventInput): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }

  listRecent(limit: number): Promise<readonly AuditEventRecord[]> {
    return Promise.resolve(
      this.events.slice(-limit).map((event, index) => ({
        ...event,
        id: String(index + 1),
        occurredAt: new Date(0).toISOString(),
        resourceId: event.resourceId ?? null,
        sourceIp: event.sourceIp ?? null,
        userAgent: event.userAgent ?? null,
        metadata: event.metadata ?? {},
      })),
    );
  }
}
