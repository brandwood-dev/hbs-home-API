import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const NodeEnvironmentSchema = Type.Union([
  Type.Literal("development"),
  Type.Literal("test"),
  Type.Literal("staging"),
  Type.Literal("production"),
]);

const LogLevelSchema = Type.Union([
  Type.Literal("fatal"),
  Type.Literal("error"),
  Type.Literal("warn"),
  Type.Literal("info"),
  Type.Literal("debug"),
  Type.Literal("trace"),
  Type.Literal("silent"),
]);

const EnvironmentSchema = Type.Object(
  {
    nodeEnv: NodeEnvironmentSchema,
    host: Type.String({ minLength: 1 }),
    port: Type.Integer({ minimum: 1, maximum: 65_535 }),
    logLevel: LogLevelSchema,
    corsOrigins: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    docsEnabled: Type.Boolean(),
    apiPublicUrl: Type.String({ minLength: 1 }),
    databaseUrl: Type.String({ minLength: 1 }),
    databasePoolMax: Type.Integer({ minimum: 1, maximum: 20 }),
    inventoryReservationTtlSeconds: Type.Integer({
      minimum: 60,
      maximum: 86_400,
    }),
    supabaseUrl: Type.String({ minLength: 1 }),
    supabaseJwtAudience: Type.String({ minLength: 1, maxLength: 128 }),
    /** Server-only Supabase Auth Admin key; never expose to the browser. */
    supabaseSecretKey: Type.Optional(Type.String({ minLength: 1 })),
    supabaseStorageSecretKey: Type.Optional(Type.String({ minLength: 1 })),
    supabaseStorageBucket: Type.String({ minLength: 1, maxLength: 80 }),
    orderEmailNotificationsEnabled: Type.Boolean(),
    /** ISO timestamp from which order.created events are eligible for email delivery. */
    orderEmailRolloutAt: Type.Optional(Type.String({ minLength: 1 })),
    smtpHost: Type.String({ minLength: 1, maxLength: 255 }),
    smtpPort: Type.Integer({ minimum: 1, maximum: 65_535 }),
    smtpUser: Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
    smtpPassword: Type.Optional(Type.String({ minLength: 1 })),
    emailFrom: Type.String({ minLength: 3, maxLength: 255 }),
    adminAppUrl: Type.String({ minLength: 1 }),
    orderEmailPollIntervalSeconds: Type.Integer({ minimum: 5, maximum: 300 }),
    orderEmailMaxAttempts: Type.Integer({ minimum: 1, maximum: 20 }),
    orderEmailBatchSize: Type.Integer({ minimum: 1, maximum: 100 }),
    releaseVersion: Type.String({ minLength: 1 }),
    gitSha: Type.String({ minLength: 1, maxLength: 64 }),
    buildTime: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export type Environment = Readonly<Static<typeof EnvironmentSchema>>;

export class ConfigurationError extends Error {
  override readonly name = "ConfigurationError";
}

function parseBoolean(
  name: string,
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new ConfigurationError(`${name} must be either true or false.`);
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? "3000");
  if (!Number.isInteger(port)) {
    throw new ConfigurationError(
      "PORT must be an integer between 1 and 65535.",
    );
  }
  return port;
}

function parseInteger(
  name: string,
  value: string | undefined,
  fallback: number,
): number {
  const candidate = Number(value ?? String(fallback));
  if (!Number.isInteger(candidate)) {
    throw new ConfigurationError(`${name} must be an integer.`);
  }
  return candidate;
}

function validateEmailAddress(name: string, value: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
    throw new ConfigurationError(`${name} must be a valid email address.`);
  }
}

function trimmedOrUndefined(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  return candidate && candidate.length > 0 ? candidate : undefined;
}

function parseOptionalDate(
  name: string,
  value: string | undefined,
): string | undefined {
  const candidate = trimmedOrUndefined(value);
  if (!candidate) return undefined;
  const timestamp = Date.parse(candidate);
  if (!Number.isFinite(timestamp)) {
    throw new ConfigurationError(`${name} must be a valid ISO date.`);
  }
  return new Date(timestamp).toISOString();
}

function validateAbsoluteUrl(
  name: string,
  value: string,
  protocols: readonly string[],
): void {
  try {
    const url = new URL(value);
    if (!protocols.includes(url.protocol)) throw new Error("invalid protocol");
  } catch {
    throw new ConfigurationError(`${name} must be a valid absolute URL.`);
  }
}

function parseCorsOrigins(value: string | undefined): string[] {
  const configuredOrigins = (
    value ?? "http://localhost:3001,http://localhost:5173"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configuredOrigins.length === 0) {
    throw new ConfigurationError(
      "CORS_ORIGINS must contain at least one origin.",
    );
  }

  const origins = configuredOrigins.map((origin) => {
    if (origin === "*") {
      throw new ConfigurationError(
        "CORS_ORIGINS cannot use a wildcard when credentialed requests are enabled.",
      );
    }

    try {
      const url = new URL(origin);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.origin !== origin
      ) {
        throw new Error("invalid origin");
      }
      return url.origin;
    } catch {
      throw new ConfigurationError(
        "CORS_ORIGINS contains an invalid HTTP origin.",
      );
    }
  });

  return [...new Set(origins)];
}

export function loadEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): Environment {
  const nodeEnv = source.NODE_ENV ?? "development";
  const candidate = {
    nodeEnv,
    host: source.HOST ?? "0.0.0.0",
    port: parsePort(source.PORT),
    logLevel: source.LOG_LEVEL ?? (nodeEnv === "test" ? "silent" : "info"),
    corsOrigins: parseCorsOrigins(source.CORS_ORIGINS),
    docsEnabled: parseBoolean(
      "DOCS_ENABLED",
      source.DOCS_ENABLED,
      nodeEnv !== "production",
    ),
    apiPublicUrl: source.API_PUBLIC_URL ?? "http://localhost:3000",
    databaseUrl:
      source.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    databasePoolMax: parseInteger(
      "DATABASE_POOL_MAX",
      source.DATABASE_POOL_MAX,
      5,
    ),
    inventoryReservationTtlSeconds: parseInteger(
      "INVENTORY_RESERVATION_TTL_SECONDS",
      source.INVENTORY_RESERVATION_TTL_SECONDS,
      1_800,
    ),
    supabaseUrl: source.SUPABASE_URL ?? "http://127.0.0.1:54321",
    supabaseJwtAudience: source.SUPABASE_JWT_AUDIENCE ?? "authenticated",
    ...(source.SUPABASE_SECRET_KEY?.trim()
      ? { supabaseSecretKey: source.SUPABASE_SECRET_KEY.trim() }
      : {}),
    ...(source.SUPABASE_STORAGE_SECRET_KEY?.trim()
      ? { supabaseStorageSecretKey: source.SUPABASE_STORAGE_SECRET_KEY.trim() }
      : {}),
    supabaseStorageBucket: source.SUPABASE_STORAGE_BUCKET ?? "catalog-media",
    orderEmailNotificationsEnabled: parseBoolean(
      "ORDER_EMAIL_NOTIFICATIONS_ENABLED",
      source.ORDER_EMAIL_NOTIFICATIONS_ENABLED,
      false,
    ),
    ...(parseOptionalDate(
      "ORDER_EMAIL_ROLLOUT_AT",
      source.ORDER_EMAIL_ROLLOUT_AT,
    )
      ? {
          orderEmailRolloutAt: parseOptionalDate(
            "ORDER_EMAIL_ROLLOUT_AT",
            source.ORDER_EMAIL_ROLLOUT_AT,
          ),
        }
      : {}),
    smtpHost: trimmedOrUndefined(source.SMTP_HOST) ?? "ssl0.ovh.net",
    smtpPort: parseInteger("SMTP_PORT", source.SMTP_PORT, 587),
    ...(source.SMTP_USER?.trim() ? { smtpUser: source.SMTP_USER.trim() } : {}),
    ...(source.SMTP_PASSWORD?.trim()
      ? { smtpPassword: source.SMTP_PASSWORD.trim() }
      : {}),
    emailFrom: trimmedOrUndefined(source.EMAIL_FROM) ?? "contact@hbs-home.com",
    adminAppUrl:
      trimmedOrUndefined(source.ADMIN_APP_URL) ??
      (nodeEnv === "production"
        ? "https://hbs-home.com"
        : nodeEnv === "staging"
          ? "https://preview.hbs-home.com"
          : "http://localhost:5173"),
    orderEmailPollIntervalSeconds: parseInteger(
      "ORDER_EMAIL_POLL_INTERVAL_SECONDS",
      source.ORDER_EMAIL_POLL_INTERVAL_SECONDS,
      15,
    ),
    orderEmailMaxAttempts: parseInteger(
      "ORDER_EMAIL_MAX_ATTEMPTS",
      source.ORDER_EMAIL_MAX_ATTEMPTS,
      5,
    ),
    orderEmailBatchSize: parseInteger(
      "ORDER_EMAIL_BATCH_SIZE",
      source.ORDER_EMAIL_BATCH_SIZE,
      10,
    ),
    releaseVersion: source.RELEASE_VERSION ?? "0.2.0",
    gitSha: source.GIT_SHA ?? source.RENDER_GIT_COMMIT ?? "local",
    buildTime: source.BUILD_TIME ?? "1970-01-01T00:00:00.000Z",
  };

  if (!Value.Check(EnvironmentSchema, candidate)) {
    const fields = [...Value.Errors(EnvironmentSchema, candidate)]
      .map((error) => error.path || "environment")
      .join(", ");
    throw new ConfigurationError(
      `Invalid environment configuration: ${fields}.`,
    );
  }

  validateAbsoluteUrl("API_PUBLIC_URL", candidate.apiPublicUrl, [
    "http:",
    "https:",
  ]);
  validateAbsoluteUrl("DATABASE_URL", candidate.databaseUrl, [
    "postgres:",
    "postgresql:",
  ]);
  validateAbsoluteUrl("SUPABASE_URL", candidate.supabaseUrl, [
    "http:",
    "https:",
  ]);
  validateAbsoluteUrl("ADMIN_APP_URL", candidate.adminAppUrl, [
    "http:",
    "https:",
  ]);
  validateEmailAddress("EMAIL_FROM", candidate.emailFrom);

  if (candidate.orderEmailNotificationsEnabled) {
    if (!candidate.smtpUser || !candidate.smtpPassword) {
      throw new ConfigurationError(
        "SMTP_USER and SMTP_PASSWORD are required when order email notifications are enabled.",
      );
    }
    if (!candidate.orderEmailRolloutAt) {
      throw new ConfigurationError(
        "ORDER_EMAIL_ROLLOUT_AT is required when order email notifications are enabled.",
      );
    }
  }

  if (
    ["staging", "production"].includes(candidate.nodeEnv) &&
    source.DATABASE_URL === undefined
  ) {
    throw new ConfigurationError(
      "DATABASE_URL is required outside local development.",
    );
  }

  if (
    ["staging", "production"].includes(candidate.nodeEnv) &&
    source.SUPABASE_URL === undefined
  ) {
    throw new ConfigurationError(
      "SUPABASE_URL is required outside local development.",
    );
  }

  return Object.freeze(candidate);
}
