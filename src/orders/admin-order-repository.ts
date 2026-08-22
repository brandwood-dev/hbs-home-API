import { randomUUID } from "node:crypto";
import type { Kysely, Selectable } from "kysely";
import type {
  CustomerTable,
  DatabaseSchema,
  OrderItemTable,
  OrderNoteTable,
  OrderReturnTable,
  OrderReturnStatus,
  OrderStatus,
  OrderStatusHistoryTable,
  OrderTable,
} from "../database/schema.js";
import { AppError } from "../http/problem.js";
import { PostgresReservationRepository } from "../inventory/reservation-repository.js";
import { syncVariantPayload } from "../inventory/inventory-payload.js";

type OrderRow = Selectable<OrderTable>;
type CustomerRow = Selectable<CustomerTable>;
type OrderItemRow = Selectable<OrderItemTable>;
type OrderHistoryRow = Selectable<OrderStatusHistoryTable>;
type OrderNoteRow = Selectable<OrderNoteTable>;
type OrderReturnRow = Selectable<OrderReturnTable>;

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

export interface AdminOrderNote {
  id: string;
  at: string;
  author: string;
  userId: string;
  body: string;
}

export interface AdminOrderReturnInfo {
  id: string;
  status: OrderReturnStatus;
  requestedAt: string;
  reason: string;
  note: string | null;
  resolvedAt: string | null;
  resolution: "accepted" | "refused" | null;
  restocked: boolean;
  refundPayment: boolean;
  conditionReason: string | null;
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
  notes: readonly AdminOrderNote[];
  returnInfo?: AdminOrderReturnInfo | null;
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

export interface AdminOrderPaymentUpdateInput {
  orderId: string;
  paymentStatus: "pending" | "collected" | "refunded";
  actorUserId: string;
  reason?: string;
  note?: string;
}

export interface AdminOrderShippingUpdateInput {
  orderId: string;
  shippingFeeMinor: number;
  actorUserId: string;
  carrierName?: string;
  note?: string;
}

export interface AdminOrderNoteInput {
  orderId: string;
  actorUserId: string;
  actorName: string;
  text: string;
}

export interface AdminOrderCancellationInput {
  orderId: string;
  actorUserId: string;
  reason: string;
  note?: string;
  restoreStock: boolean;
  refundPayment: boolean;
}

export interface AdminOrderContactInput {
  orderId: string;
  actorUserId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
}

export interface AdminOrderAddressInput {
  orderId: string;
  actorUserId: string;
  governorate: string;
  city: string;
  postalCode?: string | null;
  addressLine: string;
  landmark?: string | null;
  deliveryNote?: string | null;
}

export interface AdminOrderReturnInput {
  orderId: string;
  actorUserId: string;
  reason: string;
  note?: string;
  action: "request" | "accept" | "refuse";
  restock: boolean;
  conditionReason?: string;
  refundPayment: boolean;
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

function mapReturn(row: OrderReturnRow): AdminOrderReturnInfo {
  return {
    id: row.id,
    status: row.status,
    requestedAt: iso(row.requested_at),
    reason: row.reason,
    note: row.note,
    resolvedAt: row.resolved_at ? iso(row.resolved_at) : null,
    resolution: row.status === "requested" ? null : row.status,
    restocked: row.restocked,
    refundPayment: row.refund_payment,
    conditionReason: row.condition_reason,
  };
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

function mapNote(row: OrderNoteRow): AdminOrderNote {
  return {
    id: row.id,
    at: iso(row.created_at),
    author: row.author_name,
    userId: row.author_user_id,
    body: row.body,
  };
}

function mapOrder(
  row: OrderRow,
  customer: CustomerRow,
  items: readonly OrderItemRow[],
  history: readonly OrderHistoryRow[],
  notes: readonly OrderNoteRow[],
  returnRow: OrderReturnRow | null,
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
    paymentStatus: row.payment_status,
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
    notes: notes.map(mapNote),
    returnInfo: returnRow ? mapReturn(returnRow) : null,
    shipment: {
      shippingStatus: row.shipping_status,
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

function invalidInput(code: string, detail: string): never {
  throw new AppError({
    statusCode: 400,
    code,
    title: "Invalid order input",
    detail,
  });
}

function assertEditable(current: OrderRow): void {
  if (["shipped", "delivered", "cancelled"].includes(current.status)) {
    throw new AppError({
      statusCode: 409,
      code: "ORDER_DETAILS_UPDATE_NOT_ALLOWED",
      title: "Order details update not allowed",
      detail:
        "Customer coordinates and delivery address cannot be changed after shipment or cancellation.",
    });
  }
}

function splitCustomerName(value: string): {
  firstName: string;
  lastName: string;
} {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    invalidInput(
      "INVALID_ORDER_CONTACT",
      "The customer name must contain a first name and a last name.",
    );
  }
  const firstName = parts.shift() ?? "";
  const lastName = parts.join(" ");
  if (
    firstName.length < 2 ||
    firstName.length > 60 ||
    lastName.length < 2 ||
    lastName.length > 60
  ) {
    invalidInput(
      "INVALID_ORDER_CONTACT",
      "The customer first and last names must each contain between 2 and 60 characters.",
    );
  }
  return { firstName, lastName };
}

function normalizePhone(value: string): string {
  const phone = value.replace(/[\s.-]/g, "");
  if (!/^(?:\+216)?[2-59][0-9]{7}$/.test(phone)) {
    invalidInput(
      "INVALID_ORDER_CONTACT",
      "The phone number must be a valid Tunisian number.",
    );
  }
  return phone.startsWith("+216") ? phone : `+216${phone}`;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase() ?? "";
  if (!email) return null;
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    invalidInput("INVALID_ORDER_CONTACT", "The email address is invalid.");
  }
  return email;
}

function normalizeAddress(
  input: AdminOrderAddressInput,
): Record<string, unknown> {
  const governorate = input.governorate.trim();
  const city = input.city.trim();
  const addressLine = input.addressLine.trim();
  if (
    !governorate ||
    governorate.length > 120 ||
    !city ||
    city.length > 120 ||
    !addressLine ||
    addressLine.length > 240
  ) {
    invalidInput(
      "INVALID_ORDER_ADDRESS",
      "Governorate, city and address are required and must be within their length limits.",
    );
  }
  const optional = (
    value: string | null | undefined,
    max: number,
  ): string | null => {
    const normalized = value?.trim() ?? "";
    if (normalized.length > max)
      invalidInput(
        "INVALID_ORDER_ADDRESS",
        "An address field exceeds its length limit.",
      );
    return normalized || null;
  };
  return {
    governorate,
    city,
    postalCode: optional(input.postalCode, 20),
    addressLine,
    landmark: optional(input.landmark, 160),
    deliveryNote: optional(input.deliveryNote, 500),
  };
}

function inventoryAvailabilityFor(
  onHand: number,
  threshold: number,
  current: "in_stock" | "low_stock" | "out_of_stock" | "made_to_order",
): "in_stock" | "low_stock" | "out_of_stock" | "made_to_order" {
  if (current === "made_to_order") return current;
  if (onHand <= 0) return "out_of_stock";
  if (onHand <= threshold) return "low_stock";
  return "in_stock";
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

  async updatePaymentStatus(
    input: AdminOrderPaymentUpdateInput,
  ): Promise<AdminOrder> {
    const reason = input.reason?.trim() ?? null;
    const note = input.note?.trim() ?? null;
    if (reason && reason.length > 500) {
      throw new AppError({
        statusCode: 400,
        code: "INVALID_PAYMENT_UPDATE",
        title: "Invalid payment update",
        detail: "The payment reason must be at most 500 characters.",
      });
    }
    if (note && note.length > 1_000) {
      throw new AppError({
        statusCode: 400,
        code: "INVALID_PAYMENT_UPDATE",
        title: "Invalid payment update",
        detail: "The internal note must be at most 1000 characters.",
      });
    }
    if (input.paymentStatus === "refunded" && !reason) {
      throw new AppError({
        statusCode: 400,
        code: "PAYMENT_REASON_REQUIRED",
        title: "A reason is required",
        detail: "A reason is required when refunding a payment.",
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
      if (current.payment_status === input.paymentStatus) return;
      const allowed =
        (current.payment_status === "pending" &&
          input.paymentStatus === "collected") ||
        (current.payment_status === "collected" &&
          input.paymentStatus === "refunded" &&
          current.status === "cancelled");
      if (!allowed) {
        throw new AppError({
          statusCode: 409,
          code: "PAYMENT_STATUS_TRANSITION_INVALID",
          title: "Invalid payment status transition",
          detail: `The payment cannot move from ${current.payment_status} to ${input.paymentStatus}.`,
        });
      }
      await trx
        .updateTable("commerce.orders")
        .set({ payment_status: input.paymentStatus, updated_at: new Date() })
        .where("id", "=", input.orderId)
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

  async updateShipping(
    input: AdminOrderShippingUpdateInput,
  ): Promise<AdminOrder> {
    if (
      !Number.isInteger(input.shippingFeeMinor) ||
      input.shippingFeeMinor < 0
    ) {
      throw new AppError({
        statusCode: 400,
        code: "INVALID_SHIPPING_FEE",
        title: "Invalid shipping fee",
        detail:
          "The shipping fee must be a non-negative integer in minor units.",
      });
    }
    const note = input.note?.trim() ?? null;
    if (note && note.length > 1_000) {
      throw new AppError({
        statusCode: 400,
        code: "INVALID_SHIPPING_UPDATE",
        title: "Invalid shipping update",
        detail: "The internal note must be at most 1000 characters.",
      });
    }
    const carrierName = input.carrierName?.trim() ?? null;
    if (carrierName && carrierName.length > 160) {
      throw new AppError({
        statusCode: 400,
        code: "INVALID_SHIPPING_UPDATE",
        title: "Invalid shipping update",
        detail: "The carrier name must be at most 160 characters.",
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
      if (["shipped", "delivered", "cancelled"].includes(current.status)) {
        throw new AppError({
          statusCode: 409,
          code: "SHIPPING_UPDATE_NOT_ALLOWED",
          title: "Shipping update not allowed",
          detail:
            "Shipping fees cannot be changed after shipment or cancellation.",
        });
      }
      const totalMinor =
        current.subtotal_minor -
        current.discount_minor +
        input.shippingFeeMinor;
      await trx
        .updateTable("commerce.orders")
        .set({
          shipping_minor: input.shippingFeeMinor,
          shipping_status: "calculated",
          total_minor: totalMinor,
          updated_at: new Date(),
        })
        .where("id", "=", input.orderId)
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

  async updateContact(input: AdminOrderContactInput): Promise<AdminOrder> {
    const { firstName, lastName } = splitCustomerName(input.customerName);
    const phone = normalizePhone(input.customerPhone);
    const email = normalizeEmail(input.customerEmail);

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
      assertEditable(current);
      await trx
        .updateTable("commerce.customers")
        .set({
          first_name: firstName,
          last_name: lastName,
          phone,
          email,
          updated_at: new Date(),
        })
        .where("id", "=", current.customer_id)
        .executeTakeFirstOrThrow();
      await trx
        .updateTable("commerce.orders")
        .set({ updated_at: new Date() })
        .where("id", "=", input.orderId)
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

  async updateAddress(input: AdminOrderAddressInput): Promise<AdminOrder> {
    const address = normalizeAddress(input);
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
      assertEditable(current);
      await trx
        .updateTable("commerce.orders")
        .set({ shipping_address: address, updated_at: new Date() })
        .where("id", "=", input.orderId)
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

  async addNote(input: AdminOrderNoteInput): Promise<AdminOrder> {
    const body = input.text.trim();
    const authorName = input.actorName.trim();
    if (!body || body.length > 2_000) {
      throw new AppError({
        statusCode: 400,
        code: "INVALID_ORDER_NOTE",
        title: "Invalid order note",
        detail: "The note must contain between one and 2000 characters.",
      });
    }
    if (!authorName || authorName.length > 160) {
      throw new AppError({
        statusCode: 400,
        code: "INVALID_ORDER_NOTE",
        title: "Invalid order note",
        detail: "The note author is invalid.",
      });
    }

    await this.database.transaction().execute(async (trx) => {
      const exists = await trx
        .selectFrom("commerce.orders")
        .select("id")
        .where("id", "=", input.orderId)
        .executeTakeFirst();
      if (!exists) {
        throw new AppError({
          statusCode: 404,
          code: "ORDER_NOT_FOUND",
          title: "Order not found",
          detail: "The requested order does not exist.",
        });
      }
      await trx
        .insertInto("commerce.order_notes")
        .values({
          id: randomUUID(),
          order_id: input.orderId,
          body,
          author_user_id: input.actorUserId,
          author_name: authorName,
          created_at: new Date(),
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

  async cancelOrder(input: AdminOrderCancellationInput): Promise<AdminOrder> {
    const reason = input.reason.trim();
    const note = input.note?.trim() ?? null;
    if (!reason) {
      throw new AppError({
        statusCode: 400,
        code: "ORDER_STATUS_REASON_REQUIRED",
        title: "A reason is required",
        detail: "A reason is required when cancelling an order.",
      });
    }
    if (reason.length > 500 || (note && note.length > 1_000)) {
      throw new AppError({
        statusCode: 400,
        code: "INVALID_ORDER_STATUS_UPDATE",
        title: "Invalid order cancellation",
        detail:
          "The reason must be at most 500 characters and the note at most 1000 characters.",
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
      if (!STATUS_TRANSITIONS[current.status].includes("cancelled")) {
        throw new AppError({
          statusCode: 409,
          code: "ORDER_STATUS_TRANSITION_INVALID",
          title: "Invalid order status transition",
          detail: `The order cannot move from ${current.status} to cancelled.`,
        });
      }
      if (input.restoreStock && current.reservation_id) {
        await new PostgresReservationRepository(trx).releaseWithinTransaction(
          trx,
          current.reservation_id,
          "cancelled",
        );
      }
      const nextPaymentStatus =
        input.refundPayment && current.payment_status === "collected"
          ? "refunded"
          : current.payment_status;
      await trx
        .updateTable("commerce.orders")
        .set({
          status: "cancelled",
          payment_status: nextPaymentStatus,
          updated_at: new Date(),
        })
        .where("id", "=", input.orderId)
        .executeTakeFirstOrThrow();
      const metadata: Record<string, unknown> = {
        restoreStock: input.restoreStock,
        refundPayment: input.refundPayment,
      };
      if (note) metadata.note = note;
      await trx
        .insertInto("commerce.order_status_history")
        .values({
          id: randomUUID(),
          order_id: input.orderId,
          status: "cancelled",
          reason,
          actor_user_id: input.actorUserId,
          metadata,
          created_at: new Date(),
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

  async returnOrder(input: AdminOrderReturnInput): Promise<AdminOrder> {
    const reason = input.reason.trim();
    const note = input.note?.trim() ?? null;
    const conditionReason = input.conditionReason?.trim() ?? null;
    if (!reason || reason.length > 500) {
      invalidInput(
        "INVALID_ORDER_RETURN",
        "A return reason between 1 and 500 characters is required.",
      );
    }
    if (note && note.length > 1_000) {
      invalidInput(
        "INVALID_ORDER_RETURN",
        "The return note must be at most 1000 characters.",
      );
    }
    if (conditionReason && conditionReason.length > 500) {
      invalidInput(
        "INVALID_ORDER_RETURN",
        "The condition reason must be at most 500 characters.",
      );
    }
    if (input.action !== "accept" && (input.restock || input.refundPayment)) {
      invalidInput(
        "INVALID_ORDER_RETURN",
        "Restocking and refunding are only available when accepting a return.",
      );
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

      if (input.action === "request") {
        if (current.status !== "delivered") {
          throw new AppError({
            statusCode: 409,
            code: "ORDER_RETURN_NOT_ALLOWED",
            title: "Return request not allowed",
            detail: "A return can only be requested for a delivered order.",
          });
        }
        const active = await trx
          .selectFrom("commerce.order_returns")
          .select("id")
          .where("order_id", "=", input.orderId)
          .where("status", "=", "requested")
          .executeTakeFirst();
        if (active) {
          throw new AppError({
            statusCode: 409,
            code: "ORDER_RETURN_ALREADY_REQUESTED",
            title: "Return already requested",
            detail: "This order already has a return awaiting resolution.",
          });
        }
        await trx
          .insertInto("commerce.order_returns")
          .values({
            id: randomUUID(),
            order_id: input.orderId,
            status: "requested",
            reason,
            note,
            condition_reason: null,
            restocked: false,
            refund_payment: false,
            requested_by: input.actorUserId,
            resolved_by: null,
            requested_at: new Date(),
            resolved_at: null,
          })
          .executeTakeFirstOrThrow();
        await trx
          .insertInto("commerce.order_status_history")
          .values({
            id: randomUUID(),
            order_id: input.orderId,
            status: "delivered",
            reason: "return_requested",
            actor_user_id: input.actorUserId,
            metadata: { reason, ...(note ? { note } : {}) },
            created_at: new Date(),
          })
          .executeTakeFirstOrThrow();
        return;
      }

      const pending = await trx
        .selectFrom("commerce.order_returns")
        .selectAll()
        .where("order_id", "=", input.orderId)
        .where("status", "=", "requested")
        .forUpdate()
        .executeTakeFirst();
      if (!pending) {
        throw new AppError({
          statusCode: 409,
          code: "ORDER_RETURN_NOT_FOUND",
          title: "Return request not found",
          detail: "This order has no return awaiting resolution.",
        });
      }
      if (current.status !== "delivered") {
        throw new AppError({
          statusCode: 409,
          code: "ORDER_RETURN_NOT_ALLOWED",
          title: "Return resolution not allowed",
          detail: "Only a delivered order can have its return resolved.",
        });
      }
      const accepted = input.action === "accept";
      if (
        accepted &&
        input.refundPayment &&
        current.payment_status !== "collected"
      ) {
        throw new AppError({
          statusCode: 409,
          code: "RETURN_REFUND_NOT_ELIGIBLE",
          title: "Refund not eligible",
          detail: "A return can only refund a payment that has been collected.",
        });
      }

      if (accepted && input.restock) {
        const items = await trx
          .selectFrom("commerce.order_items")
          .select(["variant_id", "product_id", "quantity"])
          .where("order_id", "=", input.orderId)
          .orderBy("line_number", "asc")
          .execute();
        for (const item of items) {
          const balance = await trx
            .selectFrom("inventory.stock_balances")
            .selectAll()
            .where("variant_id", "=", item.variant_id)
            .forUpdate()
            .executeTakeFirst();
          if (balance?.product_id !== item.product_id) {
            throw new AppError({
              statusCode: 409,
              code: "RETURN_RESTOCK_NOT_AVAILABLE",
              title: "Return restock not available",
              detail: `Variant ${item.variant_id} no longer has a matching inventory balance.`,
            });
          }
          const nextOnHand = balance.on_hand + item.quantity;
          const availability = inventoryAvailabilityFor(
            nextOnHand,
            balance.low_stock_threshold,
            balance.availability,
          );
          await trx
            .updateTable("inventory.stock_balances")
            .set({ on_hand: nextOnHand, availability })
            .where("variant_id", "=", item.variant_id)
            .executeTakeFirstOrThrow();
          await trx
            .insertInto("inventory.stock_movements")
            .values({
              id: randomUUID(),
              variant_id: item.variant_id,
              product_id: item.product_id,
              movement_type: "return",
              quantity: item.quantity,
              on_hand_delta: item.quantity,
              reserved_delta: 0,
              previous_on_hand: balance.on_hand,
              resulting_on_hand: nextOnHand,
              previous_reserved: balance.reserved,
              resulting_reserved: balance.reserved,
              reason: "customer_return",
              note: note ?? conditionReason,
              operation_key: `return:${pending.id}:${item.variant_id}`,
              request_fingerprint: null,
              order_id: input.orderId,
              actor_user_id: input.actorUserId,
            })
            .executeTakeFirstOrThrow();
          await syncVariantPayload(trx, item.variant_id, {
            stock: nextOnHand,
            availableQuantity: Math.max(0, nextOnHand - balance.reserved),
            lowStockThreshold: balance.low_stock_threshold,
            availability,
            trackInventory: balance.track_inventory,
          });
        }
      }

      const resolvedAt = new Date();
      await trx
        .updateTable("commerce.order_returns")
        .set({
          status: accepted ? "accepted" : "refused",
          note: note ?? pending.note,
          condition_reason: conditionReason,
          restocked: accepted && input.restock,
          refund_payment: accepted && input.refundPayment,
          resolved_by: input.actorUserId,
          resolved_at: resolvedAt,
        })
        .where("id", "=", pending.id)
        .executeTakeFirstOrThrow();
      await trx
        .updateTable("commerce.orders")
        .set({
          payment_status:
            accepted && input.refundPayment
              ? "refunded"
              : current.payment_status,
          updated_at: resolvedAt,
        })
        .where("id", "=", input.orderId)
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("commerce.order_status_history")
        .values({
          id: randomUUID(),
          order_id: input.orderId,
          status: "delivered",
          reason: accepted ? "return_accepted" : "return_refused",
          actor_user_id: input.actorUserId,
          metadata: {
            reason,
            ...(note ? { note } : {}),
            ...(conditionReason ? { conditionReason } : {}),
            restock: accepted && input.restock,
            refundPayment: accepted && input.refundPayment,
          },
          created_at: resolvedAt,
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
    const [items, history, notes, returns] = await Promise.all([
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
      this.database
        .selectFrom("commerce.order_notes")
        .selectAll()
        .where("order_id", "in", ids)
        .orderBy("created_at", "desc")
        .orderBy("id", "desc")
        .execute(),
      this.database
        .selectFrom("commerce.order_returns")
        .selectAll()
        .where("order_id", "in", ids)
        .orderBy("requested_at", "desc")
        .orderBy("id", "desc")
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
    const notesByOrder = new Map<string, OrderNoteRow[]>();
    for (const note of notes) {
      const current = notesByOrder.get(note.order_id) ?? [];
      current.push(note);
      notesByOrder.set(note.order_id, current);
    }
    const returnsByOrder = new Map<string, OrderReturnRow>();
    for (const item of returns) {
      if (!returnsByOrder.has(item.order_id))
        returnsByOrder.set(item.order_id, item);
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
          governorate: "",
          preferred_channel: null,
          tags: [],
          internal_notes: "",
          merged_into_customer_id: null,
          merged_at: null,
          created_at: row.created_at,
          updated_at: row.updated_at,
        },
        itemsByOrder.get(row.id) ?? [],
        historyByOrder.get(row.id) ?? [],
        notesByOrder.get(row.id) ?? [],
        returnsByOrder.get(row.id) ?? null,
      ),
    );
  }
}
