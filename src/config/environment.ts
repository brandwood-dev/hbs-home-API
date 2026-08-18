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

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new ConfigurationError("DOCS_ENABLED must be either true or false.");
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
    docsEnabled: parseBoolean(source.DOCS_ENABLED, nodeEnv !== "production"),
    apiPublicUrl: source.API_PUBLIC_URL ?? "http://localhost:3000",
    releaseVersion: source.RELEASE_VERSION ?? "0.1.0",
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

  try {
    new URL(candidate.apiPublicUrl);
  } catch {
    throw new ConfigurationError("API_PUBLIC_URL must be an absolute URL.");
  }

  return Object.freeze(candidate);
}
