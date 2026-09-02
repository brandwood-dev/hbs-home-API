import type { Kysely } from "kysely";
import { createClient } from "@supabase/supabase-js";
import type { DatabaseSchema } from "../database/schema.js";
import { AppError } from "../http/problem.js";
import type { AdminStatus } from "./admin-access.js";

export interface AdminManagedUser {
  id: string;
  email: string;
  displayName: string | null;
  status: AdminStatus;
  createdAt: string;
  lastSeenAt: string | null;
  roles: readonly string[];
}

export interface AdminManagedRole {
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: readonly string[];
}

export interface AdminUserListOptions {
  query?: string;
  status?: AdminStatus;
  limit: number;
  offset: number;
}

export interface AdminUserListResult {
  items: readonly AdminManagedUser[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminManagementRepository {
  listUsers(options: AdminUserListOptions): Promise<AdminUserListResult>;
  listRoles(): Promise<readonly AdminManagedRole[]>;
  updateStatus(id: string, status: AdminStatus): Promise<AdminManagedUser>;
  assignRole(
    userId: string,
    roleKey: string,
    grantedBy: string,
  ): Promise<AdminManagedUser>;
  revokeRole(
    userId: string,
    roleKey: string,
    revokedBy: string,
  ): Promise<AdminManagedUser>;
  invite(
    input: {
      email: string;
      displayName?: string;
      roleKey: string;
      redirectTo: string;
    },
    invitedBy: string,
  ): Promise<AdminManagedUser>;
}

function mapUser(
  profile: {
    auth_user_id: string;
    email: string;
    display_name: string | null;
    status: AdminStatus;
    created_at: Date;
    last_seen_at: Date | null;
  },
  roles: readonly string[],
): AdminManagedUser {
  return {
    id: profile.auth_user_id,
    email: profile.email,
    displayName: profile.display_name,
    status: profile.status,
    createdAt: profile.created_at.toISOString(),
    lastSeenAt: profile.last_seen_at?.toISOString() ?? null,
    roles,
  };
}

export class PostgresAdminManagementRepository implements AdminManagementRepository {
  constructor(
    private readonly database: Kysely<DatabaseSchema>,
    private readonly supabaseUrl?: string,
    private readonly supabaseSecretKey?: string,
  ) {}

  async listUsers(options: AdminUserListOptions): Promise<AdminUserListResult> {
    let query = this.database.selectFrom("iam.admin_profiles").selectAll();
    if (options.status) query = query.where("status", "=", options.status);
    if (options.query?.trim()) {
      const needle = `%${options.query.trim().replace(/[\\%_]/g, "\\$&")}%`;
      query = query.where((eb) =>
        eb.or([
          eb("email", "ilike", needle),
          eb("display_name", "ilike", needle),
        ]),
      );
    }
    const totalRow = await query
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .executeTakeFirstOrThrow();
    const profiles = await query
      .orderBy("created_at", "desc")
      .limit(options.limit)
      .offset(options.offset)
      .execute();
    const roles = await this.database
      .selectFrom("iam.admin_user_roles")
      .select(["auth_user_id", "role_key"])
      .where("revoked_at", "is", null)
      .where((eb) =>
        eb.or([
          eb("expires_at", "is", null),
          eb("expires_at", ">", new Date()),
        ]),
      )
      .execute();
    const byUser = new Map<string, string[]>();
    for (const role of roles)
      byUser.set(role.auth_user_id, [
        ...(byUser.get(role.auth_user_id) ?? []),
        role.role_key,
      ]);
    return {
      items: profiles.map((profile) =>
        mapUser(profile, byUser.get(profile.auth_user_id) ?? []),
      ),
      total: Number.parseInt(String(totalRow.count), 10),
      limit: options.limit,
      offset: options.offset,
    };
  }

  async listRoles(): Promise<readonly AdminManagedRole[]> {
    const roles = await this.database
      .selectFrom("iam.roles")
      .selectAll()
      .orderBy("name")
      .execute();
    const permissions = await this.database
      .selectFrom("iam.role_permissions")
      .select(["role_key", "permission_key"])
      .orderBy("permission_key")
      .execute();
    const byRole = new Map<string, string[]>();
    for (const permission of permissions)
      byRole.set(permission.role_key, [
        ...(byRole.get(permission.role_key) ?? []),
        permission.permission_key,
      ]);
    return roles.map((role) => ({
      key: role.key,
      name: role.name,
      description: role.description,
      isSystem: role.is_system,
      permissions: byRole.get(role.key) ?? [],
    }));
  }

  private async user(
    trx: Kysely<DatabaseSchema>,
    userId: string,
  ): Promise<AdminManagedUser> {
    const profile = await trx
      .selectFrom("iam.admin_profiles")
      .selectAll()
      .where("auth_user_id", "=", userId)
      .executeTakeFirst();
    if (!profile)
      throw new AppError({
        statusCode: 404,
        code: "ADMIN_USER_NOT_FOUND",
        title: "Admin user not found",
        detail: "The Admin profile does not exist.",
      });
    const roles = await trx
      .selectFrom("iam.admin_user_roles")
      .select("role_key")
      .where("auth_user_id", "=", userId)
      .where("revoked_at", "is", null)
      .where((eb) =>
        eb.or([
          eb("expires_at", "is", null),
          eb("expires_at", ">", new Date()),
        ]),
      )
      .orderBy("role_key")
      .execute();
    return mapUser(
      profile,
      roles.map((role) => role.role_key),
    );
  }

  async updateStatus(
    id: string,
    status: AdminStatus,
  ): Promise<AdminManagedUser> {
    if (status === "invited")
      throw new AppError({
        statusCode: 400,
        code: "INVALID_ADMIN_STATUS",
        title: "Invalid Admin status",
        detail: "An existing profile cannot be changed back to invited.",
      });
    return this.database.transaction().execute(async (trx) => {
      const result = await trx
        .updateTable("iam.admin_profiles")
        .set({ status, updated_at: new Date() })
        .where("auth_user_id", "=", id)
        .executeTakeFirst();
      if (Number(result.numUpdatedRows) === 0)
        throw new AppError({
          statusCode: 404,
          code: "ADMIN_USER_NOT_FOUND",
          title: "Admin user not found",
          detail: "The Admin profile does not exist.",
        });
      return this.user(trx, id);
    });
  }

  async assignRole(
    userId: string,
    roleKey: string,
    grantedBy: string,
  ): Promise<AdminManagedUser> {
    return this.database.transaction().execute(async (trx) => {
      const role = await trx
        .selectFrom("iam.roles")
        .select("key")
        .where("key", "=", roleKey)
        .executeTakeFirst();
      if (!role)
        throw new AppError({
          statusCode: 404,
          code: "ADMIN_ROLE_NOT_FOUND",
          title: "Role not found",
          detail: "The selected role does not exist.",
        });
      await this.user(trx, userId);
      const existing = await trx
        .selectFrom("iam.admin_user_roles")
        .select("id")
        .where("auth_user_id", "=", userId)
        .where("role_key", "=", roleKey)
        .where("revoked_at", "is", null)
        .executeTakeFirst();
      if (!existing)
        await trx
          .insertInto("iam.admin_user_roles")
          .values({
            auth_user_id: userId,
            role_key: roleKey,
            granted_by: grantedBy,
            expires_at: null,
            revoked_at: null,
            revoked_by: null,
          })
          .executeTakeFirstOrThrow();
      return this.user(trx, userId);
    });
  }

  async revokeRole(
    userId: string,
    roleKey: string,
    revokedBy: string,
  ): Promise<AdminManagedUser> {
    return this.database.transaction().execute(async (trx) => {
      const target = await this.user(trx, userId);
      if (roleKey === "super_admin" && target.roles.includes("super_admin")) {
        const count = await trx
          .selectFrom("iam.admin_user_roles")
          .select(({ fn }) => fn.countAll<number>().as("count"))
          .where("role_key", "=", "super_admin")
          .where("revoked_at", "is", null)
          .where((eb) =>
            eb.or([
              eb("expires_at", "is", null),
              eb("expires_at", ">", new Date()),
            ]),
          )
          .executeTakeFirstOrThrow();
        if (Number.parseInt(String(count.count), 10) <= 1)
          throw new AppError({
            statusCode: 409,
            code: "LAST_SUPER_ADMIN",
            title: "Last Super Admin",
            detail: "At least one active Super Admin must remain.",
          });
      }
      await trx
        .updateTable("iam.admin_user_roles")
        .set({ revoked_at: new Date(), revoked_by: revokedBy })
        .where("auth_user_id", "=", userId)
        .where("role_key", "=", roleKey)
        .where("revoked_at", "is", null)
        .execute();
      return this.user(trx, userId);
    });
  }

  async invite(
    input: {
      email: string;
      displayName?: string;
      roleKey: string;
      redirectTo: string;
    },
    invitedBy: string,
  ): Promise<AdminManagedUser> {
    if (!this.supabaseUrl || !this.supabaseSecretKey)
      throw new AppError({
        statusCode: 503,
        code: "AUTH_ADMIN_NOT_CONFIGURED",
        title: "Invitations unavailable",
        detail:
          "Configure SUPABASE_SECRET_KEY on the API before inviting an Admin user.",
      });
    const role = await this.database
      .selectFrom("iam.roles")
      .select("key")
      .where("key", "=", input.roleKey)
      .executeTakeFirst();
    if (!role)
      throw new AppError({
        statusCode: 404,
        code: "ADMIN_ROLE_NOT_FOUND",
        title: "Role not found",
        detail: "The selected role does not exist.",
      });
    const normalizedEmail = input.email.trim().toLowerCase();
    const supabase = createClient(this.supabaseUrl, this.supabaseSecretKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(
      normalizedEmail,
      {
        redirectTo: input.redirectTo,
        ...(input.displayName
          ? { data: { display_name: input.displayName.trim() } }
          : {}),
      },
    );
    if (error || !data.user.id)
      throw new AppError({
        statusCode: 502,
        code: "ADMIN_INVITATION_FAILED",
        title: "Invitation failed",
        detail: error?.message ?? "Supabase did not return the invited user.",
      });
    await this.database.transaction().execute(async (trx) => {
      await trx
        .insertInto("iam.admin_profiles")
        .values({
          auth_user_id: data.user.id,
          email: normalizedEmail,
          display_name: input.displayName?.trim() ?? null,
          // The invitation link is the Auth verification step. Once the
          // recipient signs in, the profile must be usable immediately.
          status: "active",
          invited_by: invitedBy,
        })
        .onConflict((oc) =>
          oc.column("auth_user_id").doUpdateSet({
            email: normalizedEmail,
            display_name: input.displayName?.trim() ?? null,
            status: "active",
            invited_by: invitedBy,
          }),
        )
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("iam.admin_user_roles")
        .values({
          auth_user_id: data.user.id,
          role_key: input.roleKey,
          granted_by: invitedBy,
          expires_at: null,
          revoked_at: null,
          revoked_by: null,
        })
        .executeTakeFirst();
    });
    return this.user(this.database, data.user.id);
  }
}
