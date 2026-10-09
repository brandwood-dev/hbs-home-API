import { randomUUID } from "node:crypto";
import type { Kysely, Selectable } from "kysely";
import type {
  DatabaseSchema,
  CustomQuoteRequestTable,
} from "../database/schema.js";
import { AppError } from "../http/problem.js";

export type CustomQuoteProductType =
  "rideaux" | "voilages" | "stores" | "ensemble_fenetre";
export type CustomQuotePreferredContact = "phone" | "whatsapp" | "email";

export interface CustomQuoteOpeningInput {
  id: string;
  label: string;
  openingType: string;
  widthCm: number;
  heightCm: number;
  quantity: number;
  installationType?: string;
}

export interface CustomQuotePreferencesInput {
  wantsAccessories: boolean;
  notes?: string;
  [key: string]: unknown;
}

export interface CustomQuoteInput {
  productType: CustomQuoteProductType;
  openings: readonly CustomQuoteOpeningInput[];
  preferences: CustomQuotePreferencesInput;
  contact: {
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
    governorate: string;
    city: string;
    preferredContact: CustomQuotePreferredContact;
  };
  attachmentMetadata: readonly Record<string, unknown>[];
  acceptedPrivacy: true;
}

export interface CustomQuoteRequest extends CustomQuoteInput {
  id: string;
  reference: string;
  createdAt: string;
  readAt: string | null;
  archivedAt: string | null;
  emailSentAt: string | null;
}

export interface CustomQuoteListParams {
  page: number;
  pageSize: number;
  query?: string;
  unreadOnly?: boolean;
  includeArchived?: boolean;
}

export interface CustomQuoteList {
  items: readonly CustomQuoteRequest[];
  total: number;
  unread: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

type QuoteRow = Selectable<CustomQuoteRequestTable>;

function dateValue(value: Date | string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

function objectArray(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function mapQuote(row: QuoteRow): CustomQuoteRequest {
  return {
    id: row.id,
    reference: row.reference,
    productType: row.product_type,
    openings: objectArray(row.openings).map((opening) => ({
      id: stringValue(opening.id, ""),
      label: stringValue(opening.label, "Ouverture"),
      openingType: stringValue(opening.openingType, "window"),
      widthCm: numberValue(opening.widthCm, 0),
      heightCm: numberValue(opening.heightCm, 0),
      quantity: numberValue(opening.quantity, 1),
      ...(typeof opening.installationType === "string"
        ? { installationType: opening.installationType }
        : {}),
    })),
    preferences: objectValue(row.preferences) as CustomQuotePreferencesInput,
    contact: {
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      ...(row.email ? { email: row.email } : {}),
      governorate: row.governorate,
      city: row.city,
      preferredContact: row.preferred_contact,
    },
    attachmentMetadata: objectArray(row.attachment_metadata),
    acceptedPrivacy: true,
    createdAt: new Date(row.created_at).toISOString(),
    readAt: dateValue(row.read_at),
    archivedAt: dateValue(row.archived_at),
    emailSentAt: dateValue(row.email_sent_at),
  };
}

function quoteReference(date = new Date()): string {
  const day = `${String(date.getFullYear())}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `DEV-${day}-${randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`;
}

function normalized(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export class PostgresCustomQuoteRepository {
  constructor(private readonly database: Kysely<DatabaseSchema>) {}

  async create(input: CustomQuoteInput): Promise<CustomQuoteRequest> {
    const id = randomUUID();
    const reference = quoteReference();
    const firstName = normalized(input.contact.firstName);
    const lastName = normalized(input.contact.lastName);
    const phone = normalized(input.contact.phone);
    const governorate = normalized(input.contact.governorate);
    const city = normalized(input.contact.city);
    const email = input.contact.email?.trim().toLowerCase() ?? null;

    const row = await this.database.transaction().execute(async (trx) => {
      const created = await trx
        .insertInto("commerce.custom_quote_requests")
        .values({
          id,
          reference,
          product_type: input.productType,
          openings: input.openings as unknown as Record<string, unknown>[],
          preferences: input.preferences,
          first_name: firstName,
          last_name: lastName,
          phone,
          email,
          governorate,
          city,
          preferred_contact: input.contact.preferredContact,
          attachment_metadata: input.attachmentMetadata as unknown as Record<
            string,
            unknown
          >[],
          accepted_privacy: true,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx
        .insertInto("commerce.outbox_events")
        .values({
          aggregate_type: "custom_quote",
          aggregate_id: id,
          event_type: "custom_quote.created",
          payload: { quoteId: id, reference },
          status: "pending",
          attempts: 0,
          processed_at: null,
          last_error: null,
        })
        .execute();

      return created;
    });
    return mapQuote(row);
  }

  async list(params: CustomQuoteListParams): Promise<CustomQuoteList> {
    const page = Math.max(1, params.page);
    const pageSize = Math.min(100, Math.max(1, params.pageSize));
    const query = params.query?.trim();
    const base = this.database
      .selectFrom("commerce.custom_quote_requests")
      .$if(Boolean(query), (builder) =>
        builder.where((eb) => {
          const needle = `%${(query ?? "").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
          return eb.or([
            eb("reference", "ilike", needle),
            eb("first_name", "ilike", needle),
            eb("last_name", "ilike", needle),
            eb("phone", "ilike", needle),
            eb("email", "ilike", needle),
          ]);
        }),
      )
      .$if(params.unreadOnly === true, (builder) =>
        builder.where("read_at", "is", null),
      )
      .$if(params.includeArchived !== true, (builder) =>
        builder.where("archived_at", "is", null),
      );

    const [rows, totalRow, unreadRow] = await Promise.all([
      base
        .selectAll()
        .orderBy("created_at", "desc")
        .orderBy("id", "desc")
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .execute(),
      base
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .executeTakeFirstOrThrow(),
      this.database
        .selectFrom("commerce.custom_quote_requests")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("read_at", "is", null)
        .where("archived_at", "is", null)
        .executeTakeFirstOrThrow(),
    ]);

    const total = totalRow.count;
    return {
      items: rows.map(mapQuote),
      total,
      unread: unreadRow.count,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getById(id: string): Promise<CustomQuoteRequest | null> {
    const row = await this.database
      .selectFrom("commerce.custom_quote_requests")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? mapQuote(row) : null;
  }

  async markRead(id: string): Promise<CustomQuoteRequest> {
    const row = await this.database
      .updateTable("commerce.custom_quote_requests")
      .set({ read_at: new Date() })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();
    if (!row)
      throw new AppError({
        statusCode: 404,
        code: "QUOTE_NOT_FOUND",
        title: "Demande introuvable",
        detail: "La demande de devis demandée n'existe pas.",
      });
    return mapQuote(row);
  }

  async archive(id: string): Promise<CustomQuoteRequest> {
    const row = await this.database
      .updateTable("commerce.custom_quote_requests")
      .set({ archived_at: new Date(), read_at: new Date() })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();
    if (!row)
      throw new AppError({
        statusCode: 404,
        code: "QUOTE_NOT_FOUND",
        title: "Demande introuvable",
        detail: "La demande de devis demandée n'existe pas.",
      });
    return mapQuote(row);
  }

  async markEmailSent(id: string): Promise<void> {
    await this.database
      .updateTable("commerce.custom_quote_requests")
      .set({ email_sent_at: new Date(), email_last_error: null })
      .where("id", "=", id)
      .executeTakeFirst();
  }

  async markEmailFailed(id: string, error: string): Promise<void> {
    await this.database
      .updateTable("commerce.custom_quote_requests")
      .set({ email_last_error: error.slice(0, 1000) })
      .where("id", "=", id)
      .executeTakeFirst();
  }
}
