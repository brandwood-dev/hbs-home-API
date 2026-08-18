import type { Kysely } from "kysely";
import type { DatabaseSchema } from "../database/schema.js";

export type AuditOutcome = "success" | "denied" | "failure";

export interface AuditEventInput {
  requestId: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: AuditOutcome;
  sourceIp?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuditEventRecord extends AuditEventInput {
  id: string;
  occurredAt: string;
  resourceId: string | null;
  sourceIp: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
}

export interface AuditRepository {
  append(event: AuditEventInput): Promise<void>;
  listRecent(limit: number): Promise<readonly AuditEventRecord[]>;
}

export class PostgresAuditRepository implements AuditRepository {
  constructor(private readonly database: Kysely<DatabaseSchema>) {}

  async append(event: AuditEventInput): Promise<void> {
    await this.database
      .insertInto("audit.events")
      .values({
        request_id: event.requestId,
        actor_user_id: event.actorUserId,
        actor_email: event.actorEmail,
        action: event.action,
        resource_type: event.resourceType,
        resource_id: event.resourceId ?? null,
        outcome: event.outcome,
        source_ip: event.sourceIp ?? null,
        user_agent: event.userAgent ?? null,
        metadata: event.metadata ?? {},
      })
      .executeTakeFirstOrThrow();
  }

  async listRecent(limit: number): Promise<readonly AuditEventRecord[]> {
    const rows = await this.database
      .selectFrom("audit.events")
      .selectAll()
      .orderBy("occurred_at", "desc")
      .orderBy("id", "desc")
      .limit(limit)
      .execute();

    return rows.map((row) => ({
      id: row.id,
      occurredAt: row.occurred_at.toISOString(),
      requestId: row.request_id,
      actorUserId: row.actor_user_id,
      actorEmail: row.actor_email,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      outcome: row.outcome,
      sourceIp: row.source_ip,
      userAgent: row.user_agent,
      metadata: row.metadata,
    }));
  }
}
