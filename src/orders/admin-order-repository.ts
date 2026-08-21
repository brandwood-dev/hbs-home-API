import { randomUUID } from "node:crypto";
import type { Kysely, Selectable } from "kysely";
import type {
  CustomerTable,
  DatabaseSchema,
  OrderItemTable,
  OrderStatus,
  OrderStatusHistoryTable,
  OrderTable,
} from "../database/schema.js";
import { AppError } from "../http/problem.js";

type OrderRow = Selectable<OrderTable>;
type CustomerRow = Selectable<CustomerTable>;
type OrderItemRow = Selectable<OrderItemTable>;
type OrderHistoryRow = Selectable<OrderStatusHistoryTable>;

export type AdminOrderSort =
  "newest" | "oldest" | "total_desc" | "total_asc" | "status";

export interface AdminOrderListParams {
  page: number;
  pageSize: number;
  status?: readonly OrderStatus[];
  governorate?: string;
  search?: string;
  sort: AdminOrderSort;
}

export interface AdminOrderItem {
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  sku: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  productReference: string;
  productSlug: string;
  imageUrl: string;
  imageAlt: string;
  selectedOptions: readonly { label: string; value: string }[];
  sellingUnitLabel: string;
  shippingProfile: string | null;
}

export interface AdminOrderEvent {
  id: string;
  at: string;
  status: OrderStatus;
  label: string;
  kind: "created" | "status";
  reason: string | null;
}

export interface AdminOrder {
  id: string;
  orderNumber: string;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;
  paymentStatus: "pending" | "collected" | "refunded";
  paymentMethod: "cash_on_delivery";
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  deliveryMethod: "home_delivery" | "store_pickup";
  governorate: string;
  city: string;
  postalCode: string | null;
  addressLine: string;
  landmark: string | null;
  deliveryNote: string | null;
  items: readonly AdminOrderItem[];
  subtotalMinor: number;
  shippingMinor: number;
  discountMinor: number;
  totalMinor: number;
  timeline: readonly AdminOrderEvent[];
  notes: readonly never[];
  shipment: {
    shippingStatus: "calculated" | "to_confirm";
    shippingFeeMinor: number;
  };
}

export interface AdminOrderCounters {
  total: number;
  pendingConfirmation: number;
  confirmed: number;
  preparing: number;
  shipped: number;
  delivered: number;
  cancelled: number;
  shippingToConfirm: number;
  paymentPending: number;
}

export interface AdminOrderList {
  items: readonly AdminOrder[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  counters: AdminOrderCounters;
  governorates: readonly string[];
}

export interface AdminOrderStatusUpdateInput {
  orderId: string;
  status: OrderStatus;
  actorUserId: string;
  reason?: string;
  note?: string;
  carrierName?: string;
  trackingNumber?: string;
  shippedAt?: string;
  deliveredAt?: string;
}

const STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_confirmation: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

function iso(value: Date): string {
  return value.toISOString();
}

function addressPart(
  value: Record<string, unknown> | null,
  key: string,
): string | null {
  const candidate = value?.[key];
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : null;
}

function statusLabel(status: OrderStatus): string {
  return (
    {
      pending_confirmation: "En attente de confirmation",
      confirmed: "Confirmée",
      preparing: "En préparation",
      shipped: "Expédiée",
      delivered: "Livrée",
      cancelled: "Annulée",
    } satisfies Record<OrderStatus, string>
  )[status];
}

function mapItem(row: OrderItemRow): AdminOrderItem {
  return {
    productId: row.product_id,
    variantId: row.variant_id,
    productName: row.product_name,
    variantLabel:
      row.selected_options.map((option) => option.value).join(" · ") ||
      row.selling_unit_label,
    sku: row.sku,
    quantity: row.quantity,
    unitPriceMinor: row.unit_price_minor,
    lineTotalMinor: row.line_total_minor,
    productReference: row.product_reference,
    productSlug: row.product_slug,
    imageUrl: row.image_url,
    imageAlt: row.image_alt,
    selectedOptions: row.selected_options,
    sellingUnitLabel: row.selling_unit_label,
    shippingProfile: row.shipping_profile,
  };
}

function mapHistory(row: OrderHistoryRow): AdminOrderEvent {
  return {
    id: row.id,
    at: iso(row.created_at),
    status: row.status,
    label: statusLabel(row.status),
    kind: row.reason === "order_created" ? "created" : "status",
    reason: row.reason,
  };
}

function mapOrder(
  row: OrderRow,
  customer: CustomerRow,
  items: readonly OrderItemRow[],
  history: readonly OrderHistoryRow[],
): AdminOrder {
  const address = row.shipping_address;
  const timeline = history.length
    ? history.map(mapHistory)
    : [
        {
          id: `${row.id}:created`,
          at: iso(row.created_at),
          status: row.status,
          label: statusLabel(row.status),
          kind: "created" as const,
          reason: "order_created",
        },
      ];
  return {
    id: row.id,
    orderNumber: row.order_number,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    status: row.status,
    paymentStatus: row.status === "delivered" ? "collected" : "pending",
    paymentMethod: row.payment_method,
    customerId: customer.id,
    customerName: `${customer.first_name} ${customer.last_name}`.trim(),
    customerPhone: customer.phone,
    customerEmail: customer.email,
    deliveryMethod: row.delivery_method,
    governorate: addressPart(address, "governorate") ?? "",
    city: addressPart(address, "city") ?? "",
    postalCode: addressPart(address, "postalCode"),
    addressLine: addressPart(address, "addressLine") ?? "",
    landmark: addressPart(address, "landmark"),
    deliveryNote: addressPart(address, "deliveryNote"),
    items: items.map(mapItem),
    subtotalMinor: row.subtotal_minor,
    shippingMinor: row.shipping_minor,
    discountMinor: row.discount_minor,
    totalMinor: row.total_minor,
    timeline,
    notes: [],
    shipment: {
      shippingStatus: "calculated",
      shippingFeeMinor: row.shipping_minor,
    },
  };
}

function matchesSearch(order: AdminOrder, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  const digits = needle.replace(/\D/g, "");
  const phone = order.customerPhone.replace(/\D/g, "");
  return (
    [
      order.orderNumber,
      order.customerName,
      order.customerEmail ?? "",
      ...order.items.flatMap((item) => [
        item.sku,
        item.productName,
        item.productReference,
      ]),
    ].some((value) => value.toLocaleLowerCase().includes(needle)) ||
    (digits.length > 0 && phone.includes(digits))
  );
}

export class PostgresAdminOrderRepository {
  constructor(private readonly database: Kysely<DatabaseSchema>) {}

  async list(params: AdminOrderListParams): Promise<AdminOrderList> {
    const headers = await this.database
      .selectFrom("commerce.orders as o")
      .innerJoin("commerce.customers as c", "c.id", "o.customer_id")
      .selectAll("o")
      .select([
        "c.id as customer_row_id",
        "c.first_name as customer_first_name",
        "c.last_name as customer_last_name",
        "c.phone as customer_phone",
        "c.email as customer_email",
      ])
      .execute();

    const orders = await this.loadOrders(headers);
    const filtered = orders.filter((order) => {
      if (params.status?.length && !params.status.includes(order.status))
        return false;
      if (
        params.governorate?.trim() &&
        order.governorate !== params.governorate.trim()
      )
        return false;
      return matchesSearch(order, params.search ?? "");
    });

    filtered.sort((left, right) => {
      switch (params.sort) {
        case "oldest":
          return left.createdAt.localeCompare(right.createdAt);
        case "total_desc":
          return right.totalMinor - left.totalMinor;
        case "total_asc":
          return left.totalMinor - right.totalMinor;
        case "status":
          return (
            left.status.localeCompare(right.status) ||
            right.createdAt.localeCompare(left.createdAt)
          );
        default:
          return right.createdAt.localeCompare(left.createdAt);
      }
    });

    const counters: AdminOrderCounters = {
      total: filtered.length,
      pendingConfirmation: filtered.filter(
        (order) => order.status === "pending_confirmation",
      ).length,
      confirmed: filtered.filter((order) => order.status === "confirmed")
        .length,
      preparing: filtered.filter((order) => order.status === "preparing")
        .length,
      shipped: filtered.filter((order) => order.status === "shipped").length,
      delivered: filtered.filter((order) => order.status === "delivered")
        .length,
      cancelled: filtered.filter((order) => order.status === "cancelled")
        .length,
      shippingToConfirm: filtered.filter(
        (order) => order.shipment.shippingStatus === "to_confirm",
      ).length,
      paymentPending: filtered.filter(
        (order) => order.paymentStatus === "pending",
      ).length,
    };

    const pageSize = Math.min(Math.max(1, params.pageSize), 100);
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.min(Math.max(1, params.page), pageCount);
    const start = (page - 1) * pageSize;
    const governorates = [
      ...new Set(orders.map((order) => order.governorate).filter(Boolean)),
    ].sort();

    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize,
      pageCount,
      counters,
      governorates,
    };
  }

  async getById(orderId: string): Promise<AdminOrder | null> {
    const headers = await this.database
      .selectFrom("commerce.orders as o")
      .innerJoin("commerce.customers as c", "c.id", "o.customer_id")
      .selectAll("o")
      .select([
        "c.id as customer_row_id",
        "c.first_name as customer_first_name",
        "c.last_name as customer_last_name",
        "c.phone as customer_phone",
        "c.email as customer_email",
      ])
      .where("o.id", "=", orderId)
      .execute();
    const [order] = await this.loadOrders(headers);
    return order ?? null;
  }

  async updateStatus(input: AdminOrderStatusUpdateInput): Promise<AdminOrder> {
    const reason = input.reason?.trim() ?? null;
    const note = input.note?.trim() ?? null;
    if (reason && reason.length > 500) {
      throw new AppError({
        statusCode: 400,
        code: "INVALID_ORDER_STATUS_UPDATE",
        title: "Invalid order status update",
        detail: "The status reason must be at most 500 characters.",
      });
    }
    if (note && note.length > 1_000) {
      throw new AppError({
        statusCode: 400,
        code: "INVALID_ORDER_STATUS_UPDATE",
        title: "Invalid order status update",
        detail: "The internal note must be at most 1000 characters.",
      });
    }
    if (input.status === "cancelled" && !reason) {
      throw new AppError({
        statusCode: 400,
        code: "ORDER_STATUS_REASON_REQUIRED",
        title: "A reason is required",
        detail: "A reason is required when cancelling an order.",
      });
    }

    await this.database.transaction().execute(async (trx) => {
      const current = await trx
        .selectFrom("commerce.orders")
        .selectAll()
        .where("id", "=", input.orderId)
        .forUpdate()
        .executeTakeFirst();
      if (!current) {
        throw new AppError({
          statusCode: 404,
          code: "ORDER_NOT_FOUND",
          title: "Order not found",
          detail: "The requested order does not exist.",
        });
      }

      if (!STATUS_TRANSITIONS[current.status].includes(input.status)) {
        throw new AppError({
          statusCode: 409,
          code: "ORDER_STATUS_TRANSITION_INVALID",
          title: "Invalid order status transition",
          detail: `The order cannot move from ${current.status} to ${input.status}.`,
        });
      }

      const updatedAt = new Date();
      await trx
        .updateTable("commerce.orders")
        .set({ status: input.status, updated_at: updatedAt })
        .where("id", "=", input.orderId)
        .executeTakeFirstOrThrow();

      const metadata: Record<string, unknown> = {};
      if (note) metadata.note = note;
      if (input.carrierName?.trim())
        metadata.carrierName = input.carrierName.trim();
      if (input.trackingNumber?.trim()) {
        metadata.trackingNumber = input.trackingNumber.trim();
      }
      if (input.shippedAt?.trim()) metadata.shippedAt = input.shippedAt.trim();
      if (input.deliveredAt?.trim()) {
        metadata.deliveredAt = input.deliveredAt.trim();
      }

      await trx
        .insertInto("commerce.order_status_history")
        .values({
          id: randomUUID(),
          order_id: input.orderId,
          status: input.status,
          reason,
          actor_user_id: input.actorUserId,
          metadata,
          created_at: updatedAt,
        })
        .executeTakeFirstOrThrow();
    });

    const updated = await this.getById(input.orderId);
    if (!updated) {
      throw new AppError({
        statusCode: 500,
        code: "ORDER_STATE_INVALID",
        title: "Order state invalid",
        detail: "The updated order could not be loaded.",
      });
    }
    return updated;
  }

  private async loadOrders(
    headers: readonly (OrderRow & {
      customer_row_id: string;
      customer_first_name: string;
      customer_last_name: string;
      customer_phone: string;
      customer_email: string | null;
    })[],
  ): Promise<AdminOrder[]> {
    if (headers.length === 0) return [];
    const ids = headers.map((row) => row.id);
    const [items, history] = await Promise.all([
      this.database
        .selectFrom("commerce.order_items")
        .selectAll()
        .where("order_id", "in", ids)
        .orderBy("line_number", "asc")
        .execute(),
      this.database
        .selectFrom("commerce.order_status_history")
        .selectAll()
        .where("order_id", "in", ids)
        .orderBy("created_at", "asc")
        .execute(),
    ]);
    const itemsByOrder = new Map<string, OrderItemRow[]>();
    for (const item of items) {
      const current = itemsByOrder.get(item.order_id) ?? [];
      current.push(item);
      itemsByOrder.set(item.order_id, current);
    }
    const historyByOrder = new Map<string, OrderHistoryRow[]>();
    for (const event of history) {
      const current = historyByOrder.get(event.order_id) ?? [];
      current.push(event);
      historyByOrder.set(event.order_id, current);
    }
    return headers.map((row) =>
      mapOrder(
        row,
        {
          id: row.customer_row_id,
          first_name: row.customer_first_name,
          last_name: row.customer_last_name,
          phone: row.customer_phone,
          email: row.customer_email,
          created_at: row.created_at,
          updated_at: row.updated_at,
        },
        itemsByOrder.get(row.id) ?? [],
        historyByOrder.get(row.id) ?? [],
      ),
    );
  }
}
