import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuditRepository } from "../audit/audit-repository.js";
import type {
  AdminAccess,
  AdminAccessRepository,
} from "../identity/admin-access.js";
import { AppError } from "../http/problem.js";
import type { AssuranceLevel, JwtVerifier } from "./jwt-verifier.js";

export interface AdminPrincipal extends AdminAccess {
  assuranceLevel: AssuranceLevel;
  sessionId: string | null;
}

export interface AdminGuardDependencies {
  jwtVerifier: JwtVerifier;
  adminAccessRepository: AdminAccessRepository;
  auditRepository: AuditRepository;
}

export interface AdminGuardOptions {
  requireMfa: boolean;
  permissions?: readonly string[];
}

function bearerToken(request: FastifyRequest): string {
  const authorization = request.headers.authorization;
  const match = /^Bearer ([^\s]+)$/i.exec(authorization ?? "");
  if (!match?.[1]) {
    throw new AppError({
      statusCode: 401,
      code: "AUTH_REQUIRED",
      title: "Authentication required",
      detail: "A valid Supabase access token is required.",
    });
  }
  return match[1];
}

async function recordDenial(
  dependencies: AdminGuardDependencies,
  request: FastifyRequest,
  access: AdminAccess | null,
  reason: string,
): Promise<void> {
  try {
    await dependencies.auditRepository.append({
      requestId: request.id,
      actorUserId: access?.userId ?? null,
      actorEmail: access?.email ?? null,
      action: "auth.admin_access_denied",
      resourceType: "admin_session",
      outcome: "denied",
      sourceIp: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadata: {
        reason,
        method: request.method,
        path: request.routeOptions.url,
      },
    });
  } catch (error) {
    request.log.warn(
      { err: error },
      "Failed to persist denied Admin access audit",
    );
  }
}

export function createAdminGuard(
  dependencies: AdminGuardDependencies,
  options: AdminGuardOptions,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request): Promise<void> => {
    let token;
    try {
      token = await dependencies.jwtVerifier.verify(bearerToken(request));
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError({
        statusCode: 401,
        code: "INVALID_ACCESS_TOKEN",
        title: "Invalid access token",
        detail: "The Supabase access token is invalid or expired.",
      });
    }

    const access = await dependencies.adminAccessRepository.findByUserId(
      token.userId,
    );
    if (access?.status !== "active" || access.email !== token.email) {
      await recordDenial(
        dependencies,
        request,
        access,
        "inactive_or_unknown_admin",
      );
      throw new AppError({
        statusCode: 403,
        code: "ADMIN_ACCESS_DENIED",
        title: "Admin access denied",
        detail: "This account is not authorized to access HBS HOME Admin.",
      });
    }

    if (options.requireMfa && token.assuranceLevel !== "aal2") {
      await recordDenial(dependencies, request, access, "mfa_required");
      throw new AppError({
        statusCode: 403,
        code: "MFA_REQUIRED",
        title: "Multi-factor authentication required",
        detail: "Complete the TOTP challenge before accessing this resource.",
      });
    }

    const missingPermissions = (options.permissions ?? []).filter(
      (permission) => !access.permissions.includes(permission),
    );
    if (missingPermissions.length > 0) {
      await recordDenial(dependencies, request, access, "permission_denied");
      throw new AppError({
        statusCode: 403,
        code: "PERMISSION_DENIED",
        title: "Permission denied",
        detail: "The current Admin role cannot access this resource.",
      });
    }

    request.adminPrincipal = {
      ...access,
      assuranceLevel: token.assuranceLevel,
      sessionId: token.sessionId,
    };
  };
}
