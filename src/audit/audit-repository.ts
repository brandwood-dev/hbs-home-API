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

export interface AuditListFilters {
  actorUserId?: string;
  action?: string;
  resourceType?: string;
  outcome?: AuditOutcome;
  dateFrom?: string;
  dateTo?: string;
}

export interface AuditRepository {
  append(event: AuditEventInput): Promise<void>;
  listRecent(
    limit: number,
    filters?: AuditListFilters,
  ): Promise<readonly AuditEventRecord[]>;
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

  async listRecent(
    limit: number,
    filters: AuditListFilters = {},
  ): Promise<readonly AuditEventRecord[]> {
    let query = this.database.selectFrom("audit.events").selectAll();
    if (filters.actorUserId)
      query = query.where("actor_user_id", "=", filters.actorUserId);
    if (filters.action) query = query.where("action", "=", filters.action);
    if (filters.resourceType)
      query = query.where("resource_type", "=", filters.resourceType);
    if (filters.outcome) query = query.where("outcome", "=", filters.outcome);
    if (filters.dateFrom) {
      const dateFrom = new Date(filters.dateFrom);
      if (!Number.isNaN(dateFrom.valueOf()))
        query = query.where("occurred_at", ">=", dateFrom);
    }
    if (filters.dateTo) {
      const dateTo = new Date(filters.dateTo);
      if (!Number.isNaN(dateTo.valueOf()))
        query = query.where("occurred_at", "<=", dateTo);
    }
    const rows = await query
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
