import type { AdminPrincipal } from "../auth/admin-guard.js";

declare module "fastify" {
  interface FastifyRequest {
    adminPrincipal: AdminPrincipal | null;
  }
}
