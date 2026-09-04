import { randomUUID } from "node:crypto";
import { sql, type Kysely, type Selectable } from "kysely";
import type {
  CustomerAddressTable,
  CustomerNoteTable,
  CustomerTable,
  DatabaseSchema,
  OrderStatus,
} from "../database/schema.js";
import { AppError } from "../http/problem.js";
import type {
  AdminOrder,
  PostgresAdminOrderRepository,
} from "../orders/admin-order-repository.js";

type CustomerRow = Selectable<CustomerTable>;
type AddressRow = Selectable<CustomerAddressTable>;
type NoteRow = Selectable<CustomerNoteTable>;
interface OrderSummaryRow {
  id: string;
  customer_id: string;
  status: OrderStatus;
  subtotal_minor: number;
  created_at: Date;
}

interface ReturnSummaryRow {
  order_id: string;
}

export type CustomerSort =
  "last_order" | "name_asc" | "spent_desc" | "orders_desc" | "aov_desc";

export interface AdminCustomerListParams {
  page: number;
  pageSize: number;
  governorates?: readonly string[];
  hasOrders?: boolean;
  hasDeliveredOrders?: boolean;
  minSpentMinor?: number;
  tags?: readonly string[];
  lastOrderFrom?: string;
  lastOrderTo?: string;
  onlyPotentialDuplicates?: boolean;
  sort: CustomerSort;
  search?: string;
}

export interface CustomerMetrics {
  totalOrders: number;
  deliveredOrders: number;
  totalSpentMinor: number;
  averageOrderValueMinor: number;
  firstOrderAt?: string;
  lastOrderAt?: string;
  cancelledOrders: number;
  returnedOrders: number;
}

export interface AdminCustomerAddress {
  id: string;
  label?: string;
  governorate: string;
  city: string;
  postalCode?: string;
  addressLine: string;
  landmark?: string;
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminCustomerNote {
  id: string;
  text: string;
  createdAt: string;
  userId?: string;
  userName?: string;
}

export interface AdminCustomer {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  governorate: string;
  tags: string[];
  internalNotes: string;
  addresses: AdminCustomerAddress[];
  createdAt: string;
  notes?: AdminCustomerNote[];
  preferredChannel?: "phone" | "email" | "whatsapp";
  mergedIntoCustomerId?: string;
  mergedAt?: string;
  updatedAt?: string;
}

export interface AdminCustomerRow extends AdminCustomer {
  metrics: CustomerMetrics;
  hasPotentialDuplicate: boolean;
}

export interface AdminCustomerDetail extends AdminCustomerRow {
  orders: AdminOrder[];
  duplicates: AdminCustomer[];
}

export interface CustomerUpdateInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string | null;
  governorate?: string;
  internalNotes?: string;
  preferredChannel?: "phone" | "email" | "whatsapp" | null;
}

export interface CustomerAddressInput {
  label?: string | null;
  governorate: string;
  city: string;
  postalCode?: string | null;
  addressLine: string;
  landmark?: string | null;
  isDefault?: boolean;
}

export interface CustomerMergeInput {
  primaryCustomerId: string;
  secondaryCustomerId: string;
  keepPhoneFrom?: "primary" | "secondary";
  keepEmailFrom?: "primary" | "secondary";
}

function iso(value: Date): string {
  return value.toISOString();
}

function normalizeText(
  value: string,
  field: string,
  min: number,
  max: number,
): string {
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new AppError({
      statusCode: 400,
      code: "INVALID_CUSTOMER_INPUT",
      title: "Invalid customer input",
      detail: `${field} must contain between ${String(min)} and ${String(max)} characters.`,
    });
  }
  return normalized;
}

function normalizePhone(value: string): string {
  const phone = value.replace(/[\s.-]/g, "");
  if (!/^(?:\+216)?[2-59][0-9]{7}$/.test(phone)) {
    throw new AppError({
      statusCode: 400,
      code: "INVALID_CUSTOMER_PHONE",
      title: "Invalid customer phone",
      detail: "The phone number must be a valid Tunisian number.",
    });
  }
  return phone.startsWith("+216") ? phone : `+216${phone}`;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase() ?? "";
  if (!email) return null;
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new AppError({
      statusCode: 400,
      code: "INVALID_CUSTOMER_EMAIL",
      title: "Invalid customer email",
      detail: "The email address is invalid.",
    });
  }
  return email;
}

function normalizedKey(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function phoneKey(value: string): string {
  return value.replace(/\D/g, "");
}

function nullableTrim(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  return trimmed;
}

function mapAddress(row: AddressRow): AdminCustomerAddress {
  return {
    id: row.id,
    ...(row.label ? { label: row.label } : {}),
    governorate: row.governorate,
    city: row.city,
    ...(row.postal_code ? { postalCode: row.postal_code } : {}),
    addressLine: row.address_line,
    ...(row.landmark ? { landmark: row.landmark } : {}),
    isDefault: row.is_default,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapNote(row: NoteRow): AdminCustomerNote {
  return {
    id: row.id,
    text: row.body,
    createdAt: iso(row.created_at),
    userId: row.author_user_id,
    userName: row.author_name,
  };
}

function mapCustomer(
  row: CustomerRow,
  addresses: readonly AddressRow[] = [],
  notes: readonly NoteRow[] = [],
): AdminCustomer {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    ...(row.email ? { email: row.email } : {}),
    governorate: row.governorate,
    tags: Array.isArray(row.tags) ? row.tags : [],
    internalNotes: row.internal_notes,
    addresses: addresses.map(mapAddress),
    createdAt: iso(row.created_at),
    notes: notes.map(mapNote),
    ...(row.preferred_channel
      ? { preferredChannel: row.preferred_channel }
      : {}),
    ...(row.merged_into_customer_id
      ? { mergedIntoCustomerId: row.merged_into_customer_id }
      : {}),
    ...(row.merged_at ? { mergedAt: iso(row.merged_at) } : {}),
    updatedAt: iso(row.updated_at),
  };
}

function metricsFor(
  orders: readonly OrderSummaryRow[],
  returnedOrderIds: ReadonlySet<string> = new Set(),
): CustomerMetrics {
  const delivered = orders.filter((order) => order.status === "delivered");
  const dates = orders
    .map((order) => order.created_at.getTime())
    .sort((a, b) => a - b);
  const totalSpentMinor = delivered.reduce(
    (sum, order) => sum + order.subtotal_minor,
    0,
  );
  const lastDate = dates.at(-1);
  return {
    totalOrders: orders.length,
    deliveredOrders: delivered.length,
    totalSpentMinor,
    averageOrderValueMinor: delivered.length
      ? Math.round(totalSpentMinor / delivered.length)
      : 0,
    ...(dates[0] === undefined
      ? {}
      : { firstOrderAt: new Date(dates[0]).toISOString() }),
    ...(lastDate === undefined
      ? {}
      : { lastOrderAt: new Date(lastDate).toISOString() }),
    cancelledOrders: orders.filter((order) => order.status === "cancelled")
      .length,
    returnedOrders: orders.filter((order) => returnedOrderIds.has(order.id))
      .length,
  };
}

function hasDuplicate(
  customer: CustomerRow,
  all: readonly CustomerRow[],
): boolean {
  const phone = phoneKey(customer.phone);
  const email = normalizedKey(customer.email ?? "");
  const name = normalizedKey(`${customer.first_name} ${customer.last_name}`);
  return all.some((other) => {
    if (other.id === customer.id || other.merged_into_customer_id) return false;
    if (phone && phoneKey(other.phone) === phone) return true;
    if (email && normalizedKey(other.email ?? "") === email) return true;
    return (
      name.length > 4 &&
      normalizedKey(`${other.first_name} ${other.last_name}`) === name &&
      normalizedKey(other.governorate) === normalizedKey(customer.governorate)
    );
  });
}

function matchesSearch(customer: CustomerRow, query: string): boolean {
  const needle = normalizedKey(query);
  if (!needle) return true;
  const digits = needle.replace(/\D/g, "");
  return (
    normalizedKey(`${customer.first_name} ${customer.last_name}`).includes(
      needle,
    ) ||
    normalizedKey(customer.email ?? "").includes(needle) ||
    (digits.length > 0 && phoneKey(customer.phone).includes(digits))
  );
}

function addressValues(
  input: CustomerAddressInput,
): Omit<
  CustomerAddressTable,
  "id" | "customer_id" | "created_at" | "updated_at"
> {
  const label = nullableTrim(input.label);
  const postalCode = nullableTrim(input.postalCode);
  const landmark = nullableTrim(input.landmark);
  return {
    label,
    governorate: normalizeText(input.governorate, "Governorate", 1, 120),
    city: normalizeText(input.city, "City", 1, 120),
    postal_code: postalCode,
    address_line: normalizeText(input.addressLine, "Address", 1, 240),
    landmark,
    is_default: Boolean(input.isDefault),
  };
}

export class PostgresAdminCustomerRepository {
  constructor(
    private readonly database: Kysely<DatabaseSchema>,
    private readonly orderRepository: PostgresAdminOrderRepository,
  ) {}

  private async customer(customerId: string): Promise<CustomerRow> {
    const row = await this.database
      .selectFrom("commerce.customers")
      .selectAll()
      .where("id", "=", customerId)
      .executeTakeFirst();
    if (!row) {
      throw new AppError({
        statusCode: 404,
        code: "CUSTOMER_NOT_FOUND",
        title: "Customer not found",
        detail: "The requested customer does not exist.",
      });
    }
    return row;
  }

  private async fullCustomer(row: CustomerRow): Promise<AdminCustomer> {
    const [addresses, notes] = await Promise.all([
      this.database
        .selectFrom("commerce.customer_addresses")
        .selectAll()
        .where("customer_id", "=", row.id)
        .orderBy("is_default", "desc")
        .orderBy("updated_at", "desc")
        .execute(),
      this.database
        .selectFrom("commerce.customer_notes")
        .selectAll()
        .where("customer_id", "=", row.id)
        .orderBy("created_at", "desc")
        .orderBy("id", "desc")
        .execute(),
    ]);
    return mapCustomer(row, addresses, notes);
  }

  async list(params: AdminCustomerListParams): Promise<{
    items: AdminCustomerRow[];
    total: number;
    page: number;
    pageSize: number;
    pageCount: number;
    governorates: string[];
    tags: string[];
  }> {
    const [customers, orders, returns] = await Promise.all([
      this.database
        .selectFrom("commerce.customers")
        .selectAll()
        .where("merged_into_customer_id", "is", null)
        .execute(),
      this.database
        .selectFrom("commerce.orders")
        .select(["id", "customer_id", "status", "subtotal_minor", "created_at"])
        .execute(),
      this.database
        .selectFrom("commerce.order_returns")
        .select("order_id")
        .where("status", "=", "accepted")
        .execute(),
    ]);
    const returnedOrderIds = new Set(returns.map((row) => row.order_id));
    const byCustomer = new Map<string, OrderSummaryRow[]>();
    for (const order of orders) {
      const entries = byCustomer.get(order.customer_id) ?? [];
      entries.push(order);
      byCustomer.set(order.customer_id, entries);
    }
    const returnedByCustomer = new Map<string, Set<string>>();
    for (const order of orders) {
      if (!returnedOrderIds.has(order.id)) continue;
      const entries = returnedByCustomer.get(order.customer_id) ?? new Set();
      entries.add(order.id);
      returnedByCustomer.set(order.customer_id, entries);
    }
    const governorates = [
      ...new Set(
        customers.map((customer) => customer.governorate).filter(Boolean),
      ),
    ].sort();
    const tags = [
      ...new Set(
        customers.flatMap((customer) =>
          Array.isArray(customer.tags) ? customer.tags : [],
        ),
      ),
    ].sort();
    let rows = customers
      .filter((customer) => matchesSearch(customer, params.search ?? ""))
      .map((customer) => ({
        ...mapCustomer(customer),
        metrics: metricsFor(
          byCustomer.get(customer.id) ?? [],
          returnedByCustomer.get(customer.id),
        ),
        hasPotentialDuplicate: hasDuplicate(customer, customers),
      }));
    rows = rows.filter((row) => {
      if (
        params.governorates?.length &&
        !params.governorates.includes(row.governorate)
      )
        return false;
      if (params.hasOrders && row.metrics.totalOrders === 0) return false;
      if (params.hasDeliveredOrders && row.metrics.deliveredOrders === 0)
        return false;
      if (
        params.minSpentMinor !== undefined &&
        row.metrics.totalSpentMinor < params.minSpentMinor
      )
        return false;
      if (
        params.tags?.length &&
        !params.tags.some((tag) => row.tags.includes(tag))
      )
        return false;
      if (params.onlyPotentialDuplicates && !row.hasPotentialDuplicate)
        return false;
      if (
        (params.lastOrderFrom || params.lastOrderTo) &&
        (!row.metrics.lastOrderAt ||
          (params.lastOrderFrom &&
            row.metrics.lastOrderAt < params.lastOrderFrom) ||
          (params.lastOrderTo && row.metrics.lastOrderAt > params.lastOrderTo))
      )
        return false;
      return true;
    });
    rows.sort((left, right) => {
      switch (params.sort) {
        case "name_asc":
          return `${left.lastName} ${left.firstName}`.localeCompare(
            `${right.lastName} ${right.firstName}`,
            "fr",
          );
        case "spent_desc":
          return right.metrics.totalSpentMinor - left.metrics.totalSpentMinor;
        case "orders_desc":
          return right.metrics.totalOrders - left.metrics.totalOrders;
        case "aov_desc":
          return (
            right.metrics.averageOrderValueMinor -
            left.metrics.averageOrderValueMinor
          );
        default:
          return (right.metrics.lastOrderAt ?? "").localeCompare(
            left.metrics.lastOrderAt ?? "",
          );
      }
    });
    const pageSize = Math.min(Math.max(1, params.pageSize), 100);
    const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
    const page = Math.min(Math.max(1, params.page), pageCount);
    return {
      items: rows.slice((page - 1) * pageSize, page * pageSize),
      total: rows.length,
      page,
      pageSize,
      pageCount,
      governorates,
      tags,
    };
  }

  async getById(customerId: string): Promise<AdminCustomerDetail | null> {
    const row = await this.database
      .selectFrom("commerce.customers")
      .selectAll()
      .where("id", "=", customerId)
      .executeTakeFirst();
    if (!row) return null;
    const orderRowsPromise = this.database
      .selectFrom("commerce.orders")
      .select(["id"])
      .where("customer_id", "=", customerId)
      .orderBy("created_at", "desc")
      .execute();
    const returnRowsPromise = orderRowsPromise.then((rows) => {
      const orderIds = rows.map((order) => order.id);
      return orderIds.length
        ? this.database
            .selectFrom("commerce.order_returns")
            .select("order_id")
            .where("status", "=", "accepted")
            .where("order_id", "in", orderIds)
            .execute()
        : Promise.resolve([] as ReturnSummaryRow[]);
    });
    const [customer, orderRows, allCustomers, returnRows] = await Promise.all([
      this.fullCustomer(row),
      orderRowsPromise,
      this.database
        .selectFrom("commerce.customers")
        .selectAll()
        .where("merged_into_customer_id", "is", null)
        .execute(),
      returnRowsPromise,
    ]);
    const returnedOrderIds = new Set(
      returnRows.map((returnRow) => returnRow.order_id),
    );
    const orders = (
      await Promise.all(
        orderRows.map((order) => this.orderRepository.getById(order.id)),
      )
    ).filter((order): order is AdminOrder => Boolean(order));
    const metrics = metricsFor(
      orders.map((order) => ({
        id: order.id,
        customer_id: customerId,
        status: order.status,
        subtotal_minor: order.subtotalMinor,
        created_at: new Date(order.createdAt),
      })),
      returnedOrderIds,
    );
    const duplicates = allCustomers
      .filter(
        (candidate) =>
          candidate.id !== row.id && hasDuplicate(row, [candidate]),
      )
      .map((candidate) => mapCustomer(candidate));
    return {
      ...customer,
      metrics,
      hasPotentialDuplicate: duplicates.length > 0,
      orders,
      duplicates,
    };
  }

  async update(
    customerId: string,
    input: CustomerUpdateInput,
  ): Promise<AdminCustomer> {
    await this.customer(customerId);
    const values: {
      first_name?: string;
      last_name?: string;
      phone?: string;
      email?: string | null;
      governorate?: string;
      internal_notes?: string;
      preferred_channel?: "phone" | "email" | "whatsapp" | null;
    } = {};
    if (input.firstName !== undefined)
      values.first_name = normalizeText(input.firstName, "First name", 2, 60);
    if (input.lastName !== undefined)
      values.last_name = normalizeText(input.lastName, "Last name", 2, 60);
    if (input.phone !== undefined) values.phone = normalizePhone(input.phone);
    if (input.email !== undefined) values.email = normalizeEmail(input.email);
    if (input.governorate !== undefined)
      values.governorate = normalizeText(
        input.governorate,
        "Governorate",
        0,
        120,
      );
    if (input.internalNotes !== undefined)
      values.internal_notes = normalizeText(
        input.internalNotes,
        "Internal notes",
        0,
        10_000,
      );
    if (input.preferredChannel !== undefined)
      values.preferred_channel = input.preferredChannel;
    const row = Object.keys(values).length
      ? await this.database
          .updateTable("commerce.customers")
          .set({ ...values, updated_at: new Date() })
          .where("id", "=", customerId)
          .returningAll()
          .executeTakeFirstOrThrow()
      : await this.customer(customerId);
    return this.fullCustomer(row);
  }

  async addAddress(
    customerId: string,
    input: CustomerAddressInput,
  ): Promise<AdminCustomer> {
    await this.customer(customerId);
    const values = addressValues(input);
    await this.database.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom("commerce.customer_addresses")
        .select("id")
        .where("customer_id", "=", customerId)
        .execute();
      const makeDefault = values.is_default || existing.length === 0;
      if (makeDefault)
        await trx
          .updateTable("commerce.customer_addresses")
          .set({ is_default: false })
          .where("customer_id", "=", customerId)
          .execute();
      await trx
        .insertInto("commerce.customer_addresses")
        .values({
          id: randomUUID(),
          customer_id: customerId,
          ...values,
          is_default: makeDefault,
        })
        .executeTakeFirstOrThrow();
    });
    return this.fullCustomer(await this.customer(customerId));
  }

  async updateAddress(
    customerId: string,
    addressId: string,
    input: CustomerAddressInput,
  ): Promise<AdminCustomer> {
    await this.customer(customerId);
    const values = addressValues(input);
    const found = await this.database
      .selectFrom("commerce.customer_addresses")
      .select("id")
      .where("id", "=", addressId)
      .where("customer_id", "=", customerId)
      .executeTakeFirst();
    if (!found)
      throw new AppError({
        statusCode: 404,
        code: "CUSTOMER_ADDRESS_NOT_FOUND",
        title: "Address not found",
        detail: "The requested customer address does not exist.",
      });
    await this.database.transaction().execute(async (trx) => {
      if (values.is_default)
        await trx
          .updateTable("commerce.customer_addresses")
          .set({ is_default: false })
          .where("customer_id", "=", customerId)
          .execute();
      await trx
        .updateTable("commerce.customer_addresses")
        .set({ ...values, updated_at: new Date() })
        .where("id", "=", addressId)
        .executeTakeFirstOrThrow();
    });
    return this.fullCustomer(await this.customer(customerId));
  }

  async deleteAddress(
    customerId: string,
    addressId: string,
  ): Promise<AdminCustomer> {
    await this.customer(customerId);
    const found = await this.database
      .selectFrom("commerce.customer_addresses")
      .select(["id", "is_default"])
      .where("id", "=", addressId)
      .where("customer_id", "=", customerId)
      .executeTakeFirst();
    if (!found)
      throw new AppError({
        statusCode: 404,
        code: "CUSTOMER_ADDRESS_NOT_FOUND",
        title: "Address not found",
        detail: "The requested customer address does not exist.",
      });
    await this.database.transaction().execute(async (trx) => {
      await trx
        .deleteFrom("commerce.customer_addresses")
        .where("id", "=", addressId)
        .executeTakeFirstOrThrow();
      if (found.is_default) {
        const next = await trx
          .selectFrom("commerce.customer_addresses")
          .select("id")
          .where("customer_id", "=", customerId)
          .orderBy("updated_at", "desc")
          .executeTakeFirst();
        if (next)
          await trx
            .updateTable("commerce.customer_addresses")
            .set({ is_default: true })
            .where("id", "=", next.id)
            .execute();
      }
    });
    return this.fullCustomer(await this.customer(customerId));
  }

  async setDefaultAddress(
    customerId: string,
    addressId: string,
  ): Promise<AdminCustomer> {
    await this.customer(customerId);
    const found = await this.database
      .selectFrom("commerce.customer_addresses")
      .select("id")
      .where("id", "=", addressId)
      .where("customer_id", "=", customerId)
      .executeTakeFirst();
    if (!found)
      throw new AppError({
        statusCode: 404,
        code: "CUSTOMER_ADDRESS_NOT_FOUND",
        title: "Address not found",
        detail: "The requested customer address does not exist.",
      });
    await this.database.transaction().execute(async (trx) => {
      await trx
        .updateTable("commerce.customer_addresses")
        .set({ is_default: false })
        .where("customer_id", "=", customerId)
        .execute();
      await trx
        .updateTable("commerce.customer_addresses")
        .set({ is_default: true, updated_at: new Date() })
        .where("id", "=", addressId)
        .executeTakeFirstOrThrow();
    });
    return this.fullCustomer(await this.customer(customerId));
  }

  async updateTags(
    customerId: string,
    tags: readonly string[],
  ): Promise<AdminCustomer> {
    await this.customer(customerId);
    const normalized = [
      ...new Set(tags.map((tag) => tag.trim()).filter(Boolean)),
    ];
    if (normalized.some((tag) => tag.length > 60) || normalized.length > 30) {
      throw new AppError({
        statusCode: 400,
        code: "INVALID_CUSTOMER_TAGS",
        title: "Invalid customer tags",
        detail: "Customer tags are limited to 30 values of 60 characters.",
      });
    }
    const row = await this.database
      .updateTable("commerce.customers")
      .set({
        tags: sql`cast(${JSON.stringify(normalized)} as jsonb)` as unknown as string[],
        updated_at: new Date(),
      })
      .where("id", "=", customerId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.fullCustomer(row);
  }

  async addNote(
    customerId: string,
    text: string,
    actorUserId: string,
    actorName: string,
  ): Promise<AdminCustomer> {
    await this.customer(customerId);
    const body = normalizeText(text, "Note", 1, 2_000);
    await this.database
      .insertInto("commerce.customer_notes")
      .values({
        id: randomUUID(),
        customer_id: customerId,
        body,
        author_user_id: actorUserId,
        author_name: normalizeText(actorName, "Author", 1, 160),
        created_at: new Date(),
      })
      .executeTakeFirstOrThrow();
    return this.fullCustomer(await this.customer(customerId));
  }

  async findPotentialDuplicates(customerId: string): Promise<AdminCustomer[]> {
    const row = await this.customer(customerId);
    const all = await this.database
      .selectFrom("commerce.customers")
      .selectAll()
      .where("merged_into_customer_id", "is", null)
      .execute();
    return all
      .filter(
        (candidate) =>
          candidate.id !== row.id && hasDuplicate(row, [candidate]),
      )
      .map((candidate) => mapCustomer(candidate));
  }

  async merge(input: CustomerMergeInput): Promise<AdminCustomer> {
    if (input.primaryCustomerId === input.secondaryCustomerId)
      throw new AppError({
        statusCode: 400,
        code: "CUSTOMER_MERGE_SELF",
        title: "Invalid customer merge",
        detail: "A customer cannot be merged with itself.",
      });
    await this.database.transaction().execute(async (trx) => {
      const [primary, secondary] = await Promise.all([
        trx
          .selectFrom("commerce.customers")
          .selectAll()
          .where("id", "=", input.primaryCustomerId)
          .forUpdate()
          .executeTakeFirst(),
        trx
          .selectFrom("commerce.customers")
          .selectAll()
          .where("id", "=", input.secondaryCustomerId)
          .forUpdate()
          .executeTakeFirst(),
      ]);
      if (!primary || !secondary)
        throw new AppError({
          statusCode: 404,
          code: "CUSTOMER_NOT_FOUND",
          title: "Customer not found",
          detail: "Both customers must exist before merging.",
        });
      if (secondary.merged_into_customer_id)
        throw new AppError({
          statusCode: 409,
          code: "CUSTOMER_ALREADY_MERGED",
          title: "Customer already merged",
          detail: "The secondary customer has already been merged.",
        });
      if (primary.merged_into_customer_id)
        throw new AppError({
          statusCode: 409,
          code: "CUSTOMER_ALREADY_MERGED",
          title: "Customer already merged",
          detail: "The primary customer has already been merged.",
        });
      const primaryPhone =
        input.keepPhoneFrom === "secondary" ? secondary.phone : primary.phone;
      const primaryEmail =
        input.keepEmailFrom === "secondary" ? secondary.email : primary.email;
      const mergedTags = [
        ...new Set([
          ...(Array.isArray(primary.tags) ? primary.tags : []),
          ...(Array.isArray(secondary.tags) ? secondary.tags : []),
        ]),
      ];
      await trx
        .updateTable("commerce.customers")
        .set({
          phone: primaryPhone,
          email: primaryEmail,
          tags: sql`cast(${JSON.stringify(mergedTags)} as jsonb)` as unknown as string[],
          updated_at: new Date(),
        })
        .where("id", "=", primary.id)
        .executeTakeFirstOrThrow();
      await trx
        .updateTable("commerce.customer_addresses")
        .set({ is_default: false })
        .where("customer_id", "=", secondary.id)
        .execute();
      await trx
        .updateTable("commerce.customer_addresses")
        .set({ customer_id: primary.id, updated_at: new Date() })
        .where("customer_id", "=", secondary.id)
        .execute();
      await trx
        .updateTable("commerce.customer_notes")
        .set({ customer_id: primary.id })
        .where("customer_id", "=", secondary.id)
        .execute();
      await trx
        .updateTable("commerce.orders")
        .set({ customer_id: primary.id, updated_at: new Date() })
        .where("customer_id", "=", secondary.id)
        .execute();
      await trx
        .updateTable("commerce.customers")
        .set({
          merged_into_customer_id: primary.id,
          merged_at: new Date(),
          updated_at: new Date(),
        })
        .where("id", "=", secondary.id)
        .executeTakeFirstOrThrow();
    });
    const merged = await this.getById(input.primaryCustomerId);
    if (!merged) {
      throw new AppError({
        statusCode: 500,
        code: "CUSTOMER_MERGE_STATE_INVALID",
        title: "Customer merge failed",
        detail: "The merged customer could not be loaded.",
      });
    }
    return merged;
  }
}
