import type { ColumnType, Generated } from "kysely";

type NullableTimestamp = ColumnType<
  Date | null,
  Date | string | null | undefined,
  Date | string | null
>;

export interface AdminProfileTable {
  auth_user_id: string;
  email: string;
  display_name: string | null;
  status: "invited" | "active" | "suspended" | "revoked";
  invited_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  last_seen_at: NullableTimestamp;
}

export interface RoleTable {
  key: string;
  name: string;
  description: string;
  is_system: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface PermissionTable {
  key: string;
  description: string;
  created_at: Generated<Date>;
}

export interface RolePermissionTable {
  role_key: string;
  permission_key: string;
  created_at: Generated<Date>;
}

export interface AdminUserRoleTable {
  id: Generated<string>;
  auth_user_id: string;
  role_key: string;
  granted_by: string | null;
  granted_at: Generated<Date>;
  expires_at: NullableTimestamp;
  revoked_at: NullableTimestamp;
  revoked_by: string | null;
}

export interface AuditEventTable {
  id: Generated<string>;
  occurred_at: Generated<Date>;
  request_id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  outcome: "success" | "denied" | "failure";
  source_ip: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
}

export interface CatalogProductTable {
  id: string;
  slug: string;
  is_published: Generated<boolean>;
  is_demo: Generated<boolean>;
  category: string;
  material: string;
  opacity_level: string | null;
  selling_mode: string;
  pattern: string | null;
  blind_type: string | null;
  is_large_width: boolean;
  is_new: boolean;
  is_best_seller: boolean;
  is_featured: boolean;
  is_thermal: boolean;
  recommendation_score: number;
  product: Record<string, unknown>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface DatabaseSchema {
  "iam.admin_profiles": AdminProfileTable;
  "iam.roles": RoleTable;
  "iam.permissions": PermissionTable;
  "iam.role_permissions": RolePermissionTable;
  "iam.admin_user_roles": AdminUserRoleTable;
  "audit.events": AuditEventTable;
  "catalog.products": CatalogProductTable;
}
