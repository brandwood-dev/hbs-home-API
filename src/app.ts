import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify, {
  LogController,
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";
import { randomUUID } from "node:crypto";
import {
  PostgresAuditRepository,
  type AuditRepository,
} from "./audit/audit-repository.js";
import { SupabaseJwtVerifier, type JwtVerifier } from "./auth/jwt-verifier.js";
import { loadEnvironment, type Environment } from "./config/environment.js";
import {
  createDatabaseConnection,
  type DatabaseConnection,
} from "./database/connection.js";
import { registerErrorHandling } from "./http/error-handler.js";
import { registerOpenApi } from "./http/openapi.js";
import { ProblemDetailSchema } from "./http/problem.js";
import {
  HealthResponseSchema,
  ReadinessResponseSchema,
  ReadinessUnavailableResponseSchema,
  VersionResponseSchema,
} from "./http/schemas.js";
import {
  PostgresAdminAccessRepository,
  type AdminAccessRepository,
} from "./identity/admin-access.js";
import {
  PostgresAdminCatalogRepository,
  type AdminCatalogRepository,
} from "./catalog/admin-catalog-repository.js";
import {
  PostgresInventoryRepository,
  type InventoryRepository,
} from "./inventory/inventory-repository.js";
import {
  PostgresReservationRepository,
  type ReservationRepository,
} from "./inventory/reservation-repository.js";
import {
  PostgresCartRepository,
  type CartRepository,
} from "./cart/cart-repository.js";
import {
  PostgresFavoritesRepository,
  type FavoritesRepository,
} from "./favorites/favorites-repository.js";
import {
  PostgresAdminPromotionRepository,
  type AdminPromotionRepository,
} from "./promotions/admin-promotion-repository.js";
import {
  PostgresOrderRepository,
  type OrderRepository,
} from "./orders/order-repository.js";
import { PostgresAdminOrderRepository } from "./orders/admin-order-repository.js";
import { PostgresAdminCustomerRepository } from "./customers/admin-customer-repository.js";
import {
  PostgresAdminContentRepository,
  type AdminContentRepository,
} from "./content/admin-content-repository.js";
import {
  PostgresHomeContentRepository,
  type HomeContentRepository,
} from "./content/home-content-repository.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAdminDashboardRoutes } from "./routes/admin-dashboard.js";
import { registerAdminCatalogRoutes } from "./routes/admin-catalog.js";
import { registerAdminPromotionRoutes } from "./routes/admin-promotions.js";
import { registerAdminInventoryRoutes } from "./routes/admin-inventory.js";
import { registerAdminInventoryReservationRoutes } from "./routes/admin-inventory-reservations.js";
import { registerCartRoutes } from "./routes/cart.js";
import { registerFavoritesRoutes } from "./routes/favorites.js";
import { registerOrderRoutes } from "./routes/orders.js";
import { registerAdminOrderRoutes } from "./routes/admin-orders.js";
import { registerAdminCustomerRoutes } from "./routes/admin-customers.js";
import { registerAdminContentRoutes } from "./routes/admin-content.js";
import { registerAdminHomeContentRoutes } from "./routes/admin-home-content.js";
import { registerContentRoutes } from "./routes/content.js";
import { registerArticleRoutes } from "./routes/articles.js";
import { registerHomeContentRoutes } from "./routes/home-content.js";
import { registerCatalogRoutes } from "./routes/catalog.js";
import { registerCatalogCategoryRoutes } from "./routes/catalog-categories.js";
import { registerSystemRoutes } from "./routes/system.js";
import {
  PostgresAdminArticleRepository,
  type ArticleRepository,
} from "./content/article-repository.js";

export interface BuildAppOptions {
  environment?: Environment;
  logger?: FastifyServerOptions["logger"];
  database?: DatabaseConnection;
  jwtVerifier?: JwtVerifier;
  adminAccessRepository?: AdminAccessRepository;
  auditRepository?: AuditRepository;
  adminCatalogRepository?: AdminCatalogRepository;
  adminPromotionRepository?: AdminPromotionRepository;
  inventoryRepository?: InventoryRepository;
  reservationRepository?: ReservationRepository;
  cartRepository?: CartRepository;
  favoritesRepository?: FavoritesRepository;
  orderRepository?: OrderRepository;
  adminOrderRepository?: PostgresAdminOrderRepository;
  adminCustomerRepository?: PostgresAdminCustomerRepository;
  adminContentRepository?: AdminContentRepository;
  homeContentRepository?: HomeContentRepository;
  articleRepository?: ArticleRepository;
}

function requestIdFromHeader(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate && /^[A-Za-z0-9._:-]{1,128}$/.test(candidate)) return candidate;
  return randomUUID();
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const environment = options.environment ?? loadEnvironment();
  const database = options.database ?? createDatabaseConnection(environment);
  const adminAccessRepository =
    options.adminAccessRepository ??
    new PostgresAdminAccessRepository(database.client);
  const auditRepository =
    options.auditRepository ?? new PostgresAuditRepository(database.client);
  const jwtVerifier =
    options.jwtVerifier ?? new SupabaseJwtVerifier(environment);
  const adminCatalogRepository =
    options.adminCatalogRepository ??
    new PostgresAdminCatalogRepository(database.client);
  const adminPromotionRepository =
    options.adminPromotionRepository ??
    new PostgresAdminPromotionRepository(database.client);
  const inventoryRepository =
    options.inventoryRepository ??
    new PostgresInventoryRepository(database.client);
  const reservationRepository =
    options.reservationRepository ??
    new PostgresReservationRepository(database.client);
  const cartRepository =
    options.cartRepository ?? new PostgresCartRepository(database.client);
  const favoritesRepository =
    options.favoritesRepository ??
    new PostgresFavoritesRepository(database.client);
  const orderRepository =
    options.orderRepository ?? new PostgresOrderRepository(database.client);
  const adminOrderRepository =
    options.adminOrderRepository ??
    new PostgresAdminOrderRepository(database.client);
  const adminCustomerRepository =
    options.adminCustomerRepository ??
    new PostgresAdminCustomerRepository(database.client, adminOrderRepository);
  const adminContentRepository =
    options.adminContentRepository ??
    new PostgresAdminContentRepository(database.client);
  const homeContentRepository =
    options.homeContentRepository ??
    new PostgresHomeContentRepository(database.client);
  const articleRepository =
    options.articleRepository ??
    new PostgresAdminArticleRepository(database.client);
  const app = Fastify({
    logger:
      options.logger ??
      (environment.logLevel === "silent"
        ? false
        : {
            level: environment.logLevel,
            redact: {
              paths: [
                "req.headers.authorization",
                "req.headers.cookie",
                "res.headers.set-cookie",
              ],
              censor: "[REDACTED]",
            },
          }),
    genReqId: (request) => requestIdFromHeader(request.headers["x-request-id"]),
    logController: new LogController({ disableRequestLogging: false }),
    trustProxy: true,
  });

  app.addSchema(ProblemDetailSchema);
  app.addSchema(HealthResponseSchema);
  app.addSchema(ReadinessResponseSchema);
  app.addSchema(ReadinessUnavailableResponseSchema);
  app.addSchema(VersionResponseSchema);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: environment.corsOrigins,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  await registerOpenApi(app, environment);

  app.addHook("onSend", async (request, reply) => {
    void reply.header("x-request-id", request.id);
  });
  app.decorateRequest("adminPrincipal", null);

  if (!options.database) {
    app.addHook("onClose", async () => database.destroy());
  }

  registerErrorHandling(app);
  registerSystemRoutes(app, environment, database);
  registerCatalogRoutes(app, { database });
  registerCatalogCategoryRoutes(app, { database });
  registerAdminRoutes(app, {
    jwtVerifier,
    adminAccessRepository,
    auditRepository,
  });
  registerAdminDashboardRoutes(app, {
    jwtVerifier,
    adminAccessRepository,
    auditRepository,
    adminOrderRepository,
    inventoryRepository,
  });
  registerAdminCatalogRoutes(app, {
    jwtVerifier,
    adminAccessRepository,
    auditRepository,
    adminCatalogRepository,
  });
  registerAdminPromotionRoutes(app, {
    jwtVerifier,
    adminAccessRepository,
    auditRepository,
    adminPromotionRepository,
  });
  registerAdminInventoryRoutes(app, {
    jwtVerifier,
    adminAccessRepository,
    auditRepository,
    inventoryRepository,
  });
  registerAdminInventoryReservationRoutes(app, {
    jwtVerifier,
    adminAccessRepository,
    auditRepository,
    reservationRepository,
    environment,
  });
  registerAdminOrderRoutes(app, {
    jwtVerifier,
    adminAccessRepository,
    auditRepository,
    adminOrderRepository,
  });
  registerAdminCustomerRoutes(app, {
    jwtVerifier,
    adminAccessRepository,
    auditRepository,
    adminCustomerRepository,
  });
  registerAdminContentRoutes(app, {
    jwtVerifier,
    adminAccessRepository,
    auditRepository,
    adminContentRepository,
  });
  registerContentRoutes(app, { adminContentRepository });
  registerArticleRoutes(app, {
    jwtVerifier,
    adminAccessRepository,
    articleRepository,
    auditRepository,
  });
  registerCartRoutes(app, { cartRepository });
  registerFavoritesRoutes(app, { favoritesRepository });
  registerOrderRoutes(app, { orderRepository });
  registerAdminHomeContentRoutes(app, {
    jwtVerifier,
    adminAccessRepository,
    auditRepository,
    homeContentRepository,
  });
  registerHomeContentRoutes(app, { homeContentRepository });

  await app.ready();
  return app;
}
