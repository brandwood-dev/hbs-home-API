import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from "jose";
import type { Environment } from "../config/environment.js";

export type AssuranceLevel = "aal1" | "aal2";

export interface VerifiedAuthToken {
  userId: string;
  email: string;
  assuranceLevel: AssuranceLevel;
  sessionId: string | null;
}

export interface JwtVerifier {
  verify(token: string): Promise<VerifiedAuthToken>;
}

export class InvalidAccessTokenError extends Error {
  override readonly name = "InvalidAccessTokenError";
}

export class SupabaseJwtVerifier implements JwtVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;

  constructor(private readonly environment: Environment) {
    const baseUrl = environment.supabaseUrl.replace(/\/$/, "");
    this.issuer = `${baseUrl}/auth/v1`;
    this.jwks = createRemoteJWKSet(
      new URL(`${this.issuer}/.well-known/jwks.json`),
      {
        cooldownDuration: 30_000,
        timeoutDuration: 5_000,
      },
    );
  }

  async verify(token: string): Promise<VerifiedAuthToken> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.environment.supabaseJwtAudience,
        algorithms: ["ES256", "RS256"],
      });

      if (
        typeof payload.sub !== "string" ||
        typeof payload.email !== "string" ||
        payload.role !== "authenticated"
      ) {
        throw new InvalidAccessTokenError("Required JWT claims are missing.");
      }

      return {
        userId: payload.sub,
        email: payload.email.toLowerCase(),
        assuranceLevel: payload.aal === "aal2" ? "aal2" : "aal1",
        sessionId:
          typeof payload.session_id === "string" ? payload.session_id : null,
      };
    } catch (error) {
      if (error instanceof InvalidAccessTokenError) throw error;
      if (error instanceof joseErrors.JOSEError) {
        throw new InvalidAccessTokenError("The access token is invalid.", {
          cause: error,
        });
      }
      throw error;
    }
  }
}
