import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { AuditRepository } from "../audit/audit-repository.js";
import {
  createAdminGuard,
  type AdminGuardDependencies,
} from "../auth/admin-guard.js";
import type {
  InventoryRepository,
  InventoryRow,
} from "../inventory/inventory-repository.js";
import type {
  AdminOrder,
  PostgresAdminOrderRepository,
} from "../orders/admin-order-repository.js";
import { AppError, ProblemDetailSchema } from "../http/problem.js";

const DashboardPeriodQuery = Type.Object(
  {
    dateFrom: Type.Optional(Type.String({ format: "date" })),
    dateTo: Type.Optional(Type.String({ format: "date" })),
  },
  { additionalProperties: false },
);

type DashboardPeriodQueryType = Static<typeof DashboardPeriodQuery>;

const DashboardStatus = Type.Union([
  Type.Literal("pending_confirmation"),
  Type.Literal("confirmed"),
  Type.Literal("preparing"),
  Type.Literal("shipped"),
  Type.Literal("delivered"),
  Type.Literal("cancelled"),
]);

const DashboardStatusBreakdown = Type.Object(
  {
    status: DashboardStatus,
    count: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

const DashboardTopProduct = Type.Object(
  {
    productId: Type.String(),
    name: Type.String(),
    quantity: Type.Integer({ minimum: 0 }),
    revenueMinor: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

const DashboardSalesDay = Type.Object(
  {
    date: Type.String({ format: "date" }),
    revenueMinor: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const AdminDashboardSchema = Type.Object(
  {
    revenueMinor: Type.Integer({ minimum: 0 }),
    deliveredCount: Type.Integer({ minimum: 0 }),
    averageOrderValueMinor: Type.Integer({ minimum: 0 }),
    totalOrders: Type.Integer({ minimum: 0 }),
    pendingConfirmationCount: Type.Integer({ minimum: 0 }),
    preparingCount: Type.Integer({ minimum: 0 }),
    shippedCount: Type.Integer({ minimum: 0 }),
    cancelledCount: Type.Integer({ minimum: 0 }),
    lowStockCount: Type.Integer({ minimum: 0 }),
    statusBreakdown: Type.Array(DashboardStatusBreakdown),
    recentOrders: Type.Array(Type.Ref("AdminOrder")),
    topProducts: Type.Array(DashboardTopProduct),
    lowStockRows: Type.Array(Type.Ref("AdminInventoryRow")),
    salesByDay: Type.Array(DashboardSalesDay),
  },
  { $id: "AdminDashboard", additionalProperties: false },
);

type DashboardStatusType = Static<typeof DashboardStatus>;
export interface AdminDashboard {
  revenueMinor: number;
  deliveredCount: number;
  averageOrderValueMinor: number;
  totalOrders: number;
  pendingConfirmationCount: number;
  preparingCount: number;
  shippedCount: number;
  cancelledCount: number;
  lowStockCount: number;
  statusBreakdown: { status: DashboardStatusType; count: number }[];
  recentOrders: readonly AdminOrder[];
  topProducts: {
    productId: string;
    name: string;
    quantity: number;
    revenueMinor: number;
  }[];
  lowStockRows: readonly InventoryRow[];
  salesByDay: { date: string; revenueMinor: number }[];
}

const DASHBOARD_STATUSES: readonly DashboardStatusType[] = [
  "pending_confirmation",
  "confirmed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
];

export interface AdminDashboardRouteDependencies extends AdminGuardDependencies {
  adminOrderRepository: Pick<PostgresAdminOrderRepository, "listAll">;
  inventoryRepository: Pick<InventoryRepository, "list">;
  auditRepository: AuditRepository;
}

export function buildAdminDashboard(
  orders: readonly AdminOrder[],
  inventory: readonly InventoryRow[],
): AdminDashboard {
  const delivered = orders.filter((order) => order.status === "delivered");
  const revenueMinor = delivered.reduce(
    (total, order) => total + order.subtotalMinor,
    0,
  );
  const countBy = (status: DashboardStatusType) =>
    orders.filter((order) => order.status === status).length;
  const sold = new Map<
    string,
    { name: string; quantity: number; revenueMinor: number }
  >();

  for (const order of delivered) {
    for (const item of order.items) {
      const entry = sold.get(item.productId) ?? {
        name: item.productName,
        quantity: 0,
        revenueMinor: 0,
      };
      entry.quantity += item.quantity;
      entry.revenueMinor += item.lineTotalMinor;
      sold.set(item.productId, entry);
    }
  }

  const lowStockRows = inventory.filter(
    (row) =>
      row.variant.stock === 0 ||
      (row.variant.stock > 0 &&
        row.variant.stock <= row.variant.lowStockThreshold),
  );
  const byDay = new Map<string, number>();
  for (const order of delivered) {
    const day = order.createdAt.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + order.subtotalMinor);
  }

  return {
    revenueMinor,
    deliveredCount: delivered.length,
    averageOrderValueMinor:
      delivered.length > 0 ? Math.round(revenueMinor / delivered.length) : 0,
    totalOrders: orders.length,
    pendingConfirmationCount: countBy("pending_confirmation"),
    preparingCount: countBy("preparing"),
    shippedCount: countBy("shipped"),
    cancelledCount: countBy("cancelled"),
    lowStockCount: lowStockRows.length,
    statusBreakdown: DASHBOARD_STATUSES.map((status) => ({
      status,
      count: countBy(status),
    })),
    recentOrders: [...orders]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 8),
    topProducts: [...sold.entries()]
      .map(([productId, value]) => ({ productId, ...value }))
      .sort((left, right) => right.quantity - left.quantity)
      .slice(0, 6),
    lowStockRows: lowStockRows.slice(0, 8),
    salesByDay: [...byDay.entries()]
      .map(([date, value]) => ({ date, revenueMinor: value }))
      .sort((left, right) => left.date.localeCompare(right.date))
      .slice(-14),
  };
}

export function registerAdminDashboardRoutes(
  app: FastifyInstance,
  dependencies: AdminDashboardRouteDependencies,
): void {
  app.addSchema(AdminDashboardSchema);
  app.get<{ Querystring: DashboardPeriodQueryType }>(
    "/api/v1/admin/dashboard",
    {
      preHandler: createAdminGuard(dependencies, {
        requireMfa: true,
        // The dashboard aggregates two existing read surfaces. Reusing these
        // permissions keeps RBAC aligned with the seeded permission catalog.
        permissions: ["orders.read", "inventory.read"],
      }),
      schema: {
        operationId: "getAdminDashboard",
        summary: "Read aggregated Admin dashboard metrics",
        tags: ["admin-dashboard"],
        security: [{ bearerAuth: [] }],
        querystring: DashboardPeriodQuery,
        response: {
          200: AdminDashboardSchema,
          400: ProblemDetailSchema,
          401: ProblemDetailSchema,
          403: ProblemDetailSchema,
        },
      },
    },
    async (request) => {
      const { dateFrom, dateTo } = request.query;
      if (Boolean(dateFrom) !== Boolean(dateTo)) {
        throw new AppError({
          statusCode: 400,
          code: "INVALID_DASHBOARD_PERIOD",
          title: "Invalid dashboard period",
          detail: "dateFrom and dateTo must be provided together.",
        });
      }
      if (dateFrom && dateTo && dateFrom > dateTo) {
        throw new AppError({
          statusCode: 400,
          code: "INVALID_DASHBOARD_PERIOD",
          title: "Invalid dashboard period",
          detail: "dateFrom must be before or equal to dateTo.",
        });
      }
      if (dateFrom && dateTo) {
        const start = new Date(`${dateFrom}T00:00:00.000Z`).getTime();
        const end = new Date(`${dateTo}T00:00:00.000Z`).getTime();
        const days = Math.floor((end - start) / 86_400_000) + 1;
        if (days > 366) {
          throw new AppError({
            statusCode: 400,
            code: "DASHBOARD_PERIOD_TOO_LARGE",
            title: "Dashboard period too large",
            detail: "The dashboard period cannot exceed 366 days.",
          });
        }
      }
      const period = {
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
      };
      const [orders, inventory] = await Promise.all([
        dependencies.adminOrderRepository.listAll(period),
        dependencies.inventoryRepository.list(),
      ]);
      return buildAdminDashboard(orders, inventory);
    },
  );
}
