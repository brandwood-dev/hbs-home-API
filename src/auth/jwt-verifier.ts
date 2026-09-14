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

type AuthUserFetcher = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

interface SupabaseAuthUser {
  id?: unknown;
  email?: unknown;
}

export class InvalidAccessTokenError extends Error {
  override readonly name = "InvalidAccessTokenError";
}

export class SupabaseJwtVerifier implements JwtVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;
  private readonly authUserUrl: URL;

  constructor(
    private readonly environment: Environment,
    private readonly authUserFetcher: AuthUserFetcher = (input, init) =>
      globalThis.fetch(input, init),
  ) {
    const baseUrl = environment.supabaseUrl.replace(/\/$/, "");
    this.issuer = `${baseUrl}/auth/v1`;
    this.authUserUrl = new URL(`${this.issuer}/user`);
    this.jwks = createRemoteJWKSet(
      new URL(`${this.issuer}/.well-known/jwks.json`),
      {
        cooldownDuration: 30_000,
        timeoutDuration: 5_000,
      },
    );
  }

  async verify(token: string): Promise<VerifiedAuthToken> {
    let jwtError: unknown;
    try {
      return await this.verifyWithJwks(token);
    } catch (error) {
      jwtError = error;
    }

    // Supabase projects can retain legacy HS256 tokens while rotating to
    // asymmetric signing keys. The JWKS verifier intentionally rejects HS256
    // because the shared JWT secret is not available to this API. In that
    // transition window, ask Supabase Auth itself to validate the bearer token
    // instead of rejecting a still-valid user session.
    const authUser = await this.verifyWithAuthServer(token);
    if (authUser) return authUser;

    if (jwtError instanceof InvalidAccessTokenError) throw jwtError;
    throw jwtError;
  }

  private async verifyWithJwks(token: string): Promise<VerifiedAuthToken> {
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

  private async verifyWithAuthServer(
    token: string,
  ): Promise<VerifiedAuthToken | null> {
    const apiKey = this.environment.supabaseSecretKey;
    if (!apiKey) return null;

    let response: Response;
    try {
      response = await this.authUserFetcher(this.authUserUrl, {
        headers: {
          accept: "application/json",
          apikey: apiKey,
          authorization: `Bearer ${token}`,
        },
      });
    } catch {
      return null;
    }

    if (!response.ok) return null;

    let user: SupabaseAuthUser;
    try {
      user = (await response.json()) as SupabaseAuthUser;
    } catch {
      return null;
    }

    if (typeof user.id !== "string" || typeof user.email !== "string") {
      return null;
    }

    const claims = decodeJwtPayload(token);
    return {
      userId: user.id,
      email: user.email.toLowerCase(),
      // The Auth server has validated the token. Decode only non-security
      // context from it; default conservatively to AAL1 when absent.
      assuranceLevel: claims?.aal === "aal2" ? "aal2" : "aal1",
      sessionId:
        typeof claims?.session_id === "string" ? claims.session_id : null,
    };
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const encodedPayload = token.split(".")[1];
  if (!encodedPayload) return null;
  try {
    const json = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const value: unknown = JSON.parse(json);
    return typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
