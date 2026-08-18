import { Type, type Static } from "@sinclair/typebox";
import { API_VERSION, CONTRACT_VERSION, SERVICE_NAME } from "../constants.js";

export const HealthResponseSchema = Type.Object(
  {
    status: Type.Literal("ok"),
    service: Type.Literal(SERVICE_NAME),
    timestamp: Type.String(),
    uptimeSeconds: Type.Number({ minimum: 0 }),
  },
  { $id: "HealthResponse", additionalProperties: false },
);
export type HealthResponse = Static<typeof HealthResponseSchema>;

export const ReadinessResponseSchema = Type.Object(
  {
    status: Type.Literal("ready"),
    service: Type.Literal(SERVICE_NAME),
    timestamp: Type.String(),
    checks: Type.Object(
      {
        application: Type.Literal("up"),
      },
      { additionalProperties: false },
    ),
  },
  { $id: "ReadinessResponse", additionalProperties: false },
);
export type ReadinessResponse = Static<typeof ReadinessResponseSchema>;

export const VersionResponseSchema = Type.Object(
  {
    service: Type.Literal(SERVICE_NAME),
    apiVersion: Type.Literal(API_VERSION),
    contractVersion: Type.Literal(CONTRACT_VERSION),
    releaseVersion: Type.String(),
    gitSha: Type.String(),
    builtAt: Type.String(),
    environment: Type.Union([
      Type.Literal("development"),
      Type.Literal("test"),
      Type.Literal("staging"),
      Type.Literal("production"),
    ]),
  },
  { $id: "VersionResponse", additionalProperties: false },
);
export type VersionResponse = Static<typeof VersionResponseSchema>;
