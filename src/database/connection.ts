import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Environment } from "../config/environment.js";
import type { DatabaseSchema } from "./schema.js";

export interface DatabaseConnection {
  readonly client: Kysely<DatabaseSchema>;
  checkHealth(): Promise<boolean>;
  destroy(): Promise<void>;
}

class PostgresDatabaseConnection implements DatabaseConnection {
  readonly client: Kysely<DatabaseSchema>;

  constructor(
    pool: Pool,
    private readonly requireDedicatedLogin: boolean,
  ) {
    this.client = new Kysely<DatabaseSchema>({
      dialect: new PostgresDialect({ pool }),
    });
  }

  async checkHealth(): Promise<boolean> {
    try {
      const result = await sql<{
        current_role: string;
        session_role: string;
      }>`select current_user as current_role, session_user as session_role`.execute(
        this.client,
      );
      const role = result.rows[0];
      return (
        role?.current_role === "hbs_api" &&
        (!this.requireDedicatedLogin || role.session_role === "hbs_api")
      );
    } catch {
      return false;
    }
  }

  async destroy(): Promise<void> {
    await this.client.destroy();
  }
}

export function createDatabaseConnection(
  environment: Environment,
): DatabaseConnection {
  const pool = new Pool({
    connectionString: environment.databaseUrl,
    max: environment.databasePoolMax,
    application_name: "hbs-home-api",
    options: "-c role=hbs_api -c statement_timeout=15000 -c lock_timeout=5000",
  });

  return new PostgresDatabaseConnection(
    pool,
    environment.nodeEnv === "staging" || environment.nodeEnv === "production",
  );
}
