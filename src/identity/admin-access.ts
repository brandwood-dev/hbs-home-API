import type { Kysely } from "kysely";
import type { DatabaseSchema } from "../database/schema.js";

export type AdminStatus = "invited" | "active" | "suspended" | "revoked";

export interface AdminAccess {
  userId: string;
  email: string;
  displayName: string | null;
  status: AdminStatus;
  roles: readonly string[];
  permissions: readonly string[];
}

export interface AdminAccessRepository {
  findByUserId(userId: string): Promise<AdminAccess | null>;
  markLastSeen(userId: string): Promise<void>;
}

export class PostgresAdminAccessRepository implements AdminAccessRepository {
  constructor(private readonly database: Kysely<DatabaseSchema>) {}

  async findByUserId(userId: string): Promise<AdminAccess | null> {
    const profile = await this.database
      .selectFrom("iam.admin_profiles")
      .select(["auth_user_id", "email", "display_name", "status"])
      .where("auth_user_id", "=", userId)
      .executeTakeFirst();

    if (!profile) return null;

    const activeRoles = await this.database
      .selectFrom("iam.admin_user_roles")
      .select("role_key")
      .where("auth_user_id", "=", userId)
      .where("revoked_at", "is", null)
      .where((expression) =>
        expression.or([
          expression("expires_at", "is", null),
          expression("expires_at", ">", new Date()),
        ]),
      )
      .orderBy("role_key")
      .execute();

    const roles = activeRoles.map(({ role_key }) => role_key);
    const permissionRows =
      roles.length === 0
        ? []
        : await this.database
            .selectFrom("iam.role_permissions")
            .select("permission_key")
            .distinct()
            .where("role_key", "in", roles)
            .orderBy("permission_key")
            .execute();

    return {
      userId: profile.auth_user_id,
      email: profile.email,
      displayName: profile.display_name,
      status: profile.status,
      roles,
      permissions: permissionRows.map(({ permission_key }) => permission_key),
    };
  }

  async markLastSeen(userId: string): Promise<void> {
    await this.database
      .updateTable("iam.admin_profiles")
      .set({ last_seen_at: new Date() })
      .where("auth_user_id", "=", userId)
      .executeTakeFirst();
  }
}
