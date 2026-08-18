import { Pool } from "pg";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const operatorDatabaseUrl = required("OPERATOR_DATABASE_URL");
const password = required("HBS_API_DATABASE_PASSWORD");

if (password.length < 32) {
  throw new Error(
    "HBS_API_DATABASE_PASSWORD must contain at least 32 characters.",
  );
}

const pool = new Pool({
  connectionString: operatorDatabaseUrl,
  max: 1,
  application_name: "hbs-home-api-role-provisioning",
});

try {
  const rendered = await pool.query<{ statement: string }>(
    "select format('alter role hbs_api login password %L valid until %L', $1::text, 'infinity') as statement",
    [password],
  );
  const statement = rendered.rows[0]?.statement;
  if (!statement)
    throw new Error(
      "PostgreSQL did not render the role provisioning statement.",
    );
  await pool.query(statement);
  console.log("The restricted hbs_api database login is ready.");
} finally {
  await pool.end();
}
