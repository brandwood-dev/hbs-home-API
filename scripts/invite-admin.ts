import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === "" ? undefined : value;
}

const email = required("ADMIN_EMAIL").toLowerCase();
const supabaseUrl = required("SUPABASE_URL");
const secretKey = required("SUPABASE_SECRET_KEY");
const operatorDatabaseUrl = required("OPERATOR_DATABASE_URL");
const role = optional("ADMIN_ROLE") ?? "super_admin";
const displayName = optional("ADMIN_DISPLAY_NAME") ?? null;
const redirectTo = required("ADMIN_REDIRECT_URL");

if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("ADMIN_EMAIL is invalid.");
if (
  !redirectTo.startsWith("https://") &&
  !redirectTo.startsWith("http://localhost:")
) {
  throw new Error("ADMIN_REDIRECT_URL must use HTTPS outside localhost.");
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
});

const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
  redirectTo,
  data: displayName ? { display_name: displayName } : {},
});

if (error) throw new Error(`Supabase invitation failed: ${error.message}`);
if (!data.user.id)
  throw new Error("Supabase did not return the invited user ID.");

const pool = new Pool({
  connectionString: operatorDatabaseUrl,
  max: 1,
  application_name: "hbs-home-admin-invite",
});

try {
  const result = await pool.query<{ user_id: string }>(
    "select iam.provision_admin($1, $2, $3) as user_id",
    [email, role, displayName],
  );
  const provisionedUserId = result.rows[0]?.user_id;
  if (provisionedUserId !== data.user.id) {
    throw new Error(
      "The provisioned profile does not match the invited Auth user.",
    );
  }
  console.log(
    `Admin invitation sent and ${role} profile provisioned for ${email}.`,
  );
} finally {
  await pool.end();
}
