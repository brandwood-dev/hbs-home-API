import { randomUUID } from "node:crypto";
import { sql, type Kysely, type Selectable } from "kysely";
import type {
  DatabaseSchema,
  CustomerTable,
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
  customerId: string | null;
  convertedAt: string | null;
  convertedBy: string | null;
}

export interface CustomQuoteConversionCustomer {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  governorate: string;
  preferredChannel: CustomQuotePreferredContact | null;
}

export interface CustomQuoteConversionResult {
  quote: CustomQuoteRequest;
  customer: CustomQuoteConversionCustomer;
  action: "created" | "associated" | "already_associated";
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
type CustomerRow = Selectable<CustomerTable>;

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
    customerId: row.customer_id,
    convertedAt: dateValue(row.converted_at),
    convertedBy: row.converted_by,
  };
}

function mapConversionCustomer(
  row: CustomerRow,
): CustomQuoteConversionCustomer {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    email: row.email,
    governorate: row.governorate,
    preferredChannel: row.preferred_channel,
  };
}

function quoteReference(date = new Date()): string {
  const day = `${String(date.getFullYear())}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `DEV-${day}-${randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`;
}

function normalized(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeCustomerPhone(value: string): string {
  let phone = value.trim().replace(/[\s.\-()]/g, "");
  if (phone.startsWith("+")) phone = phone.slice(1);
  if (phone.startsWith("00216")) phone = phone.slice(5);
  else if (phone.startsWith("216") && phone.length > 8) phone = phone.slice(3);
  if (!/^\d{8}$/.test(phone)) {
    throw new AppError({
      statusCode: 400,
      code: "QUOTE_CONTACT_INVALID",
      title: "Coordonnées invalides",
      detail:
        "Le numéro de téléphone de la demande doit contenir 8 chiffres tunisiens.",
    });
  }
  return `+216${phone}`;
}

function normalizeCustomerEmail(value: string | null): string | null {
  if (!value) return null;
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError({
      statusCode: 400,
      code: "QUOTE_CONTACT_INVALID",
      title: "Coordonnées invalides",
      detail: "L’adresse e-mail de la demande est invalide.",
    });
  }
  return email;
}

function customerTags(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((tag): tag is string => typeof tag === "string")
    : [];
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
          openings:
            sql`cast(${JSON.stringify(input.openings)} as jsonb)` as unknown as Record<
              string,
              unknown
            >[],
          preferences:
            sql`cast(${JSON.stringify(input.preferences)} as jsonb)` as unknown as Record<
              string,
              unknown
            >,
          first_name: firstName,
          last_name: lastName,
          phone,
          email,
          governorate,
          city,
          preferred_contact: input.contact.preferredContact,
          attachment_metadata:
            sql`cast(${JSON.stringify(input.attachmentMetadata)} as jsonb)` as unknown as Record<
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
          payload:
            sql`cast(${JSON.stringify({ quoteId: id, reference })} as jsonb)` as unknown as Record<
              string,
              unknown
            >,
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

  /**
   * Converts a quote into a reusable customer profile. The quote row is locked
   * first, and phone/e-mail keys are advisory-locked so repeated clicks or two
   * admins working at the same time cannot create duplicate customers.
   */
  async convertToCustomer(
    id: string,
    actorUserId: string,
    actorName: string,
  ): Promise<CustomQuoteConversionResult> {
    return this.database.transaction().execute(async (trx) => {
      const quote = await trx
        .selectFrom("commerce.custom_quote_requests")
        .selectAll()
        .where("id", "=", id)
        .forUpdate()
        .executeTakeFirst();

      if (!quote)
        throw new AppError({
          statusCode: 404,
          code: "QUOTE_NOT_FOUND",
          title: "Demande introuvable",
          detail: "La demande de devis demandée n'existe pas.",
        });

      if (quote.customer_id) {
        const linked = await trx
          .selectFrom("commerce.customers")
          .selectAll()
          .where("id", "=", quote.customer_id)
          .executeTakeFirst();
        if (linked)
          return {
            quote: mapQuote(quote),
            customer: mapConversionCustomer(linked),
            action: "already_associated" as const,
          };
      }

      const firstName = normalized(quote.first_name);
      const lastName = normalized(quote.last_name);
      const phone = normalizeCustomerPhone(quote.phone);
      const email = normalizeCustomerEmail(quote.email);
      const governorate = normalized(quote.governorate).slice(0, 120);
      const city = normalized(quote.city).slice(0, 120);

      await sql`select pg_advisory_xact_lock(hashtextextended(${phone}, 0))`.execute(
        trx,
      );
      if (email) {
        await sql`select pg_advisory_xact_lock(hashtextextended(${email}, 0))`.execute(
          trx,
        );
      }

      const byPhone = await trx
        .selectFrom("commerce.customers")
        .selectAll()
        .where("phone", "=", phone)
        .where("merged_into_customer_id", "is", null)
        .orderBy("updated_at", "desc")
        .forUpdate()
        .executeTakeFirst();
      const byEmail = email
        ? await trx
            .selectFrom("commerce.customers")
            .selectAll()
            .where(sql<boolean>`lower(email) = ${email}`)
            .where("merged_into_customer_id", "is", null)
            .orderBy("updated_at", "desc")
            .forUpdate()
            .executeTakeFirst()
        : undefined;

      if (byPhone && byEmail && byPhone.id !== byEmail.id)
        throw new AppError({
          statusCode: 409,
          code: "CUSTOMER_MATCH_CONFLICT",
          title: "Correspondance client ambiguë",
          detail:
            "Le téléphone et l’e-mail correspondent à deux clients différents. Fusionnez-les avant de convertir cette demande.",
        });

      const existing = byPhone ?? byEmail;
      const action: CustomQuoteConversionResult["action"] = existing
        ? "associated"
        : "created";
      const tags = Array.from(
        new Set([...customerTags(existing?.tags), "demande-sur-mesure"]),
      );
      const customer = existing
        ? await trx
            .updateTable("commerce.customers")
            .set({
              first_name: firstName,
              last_name: lastName,
              email: email ?? existing.email,
              governorate: governorate || existing.governorate,
              preferred_channel: quote.preferred_contact,
              tags: sql`cast(${JSON.stringify(tags)} as jsonb)` as unknown as string[],
              updated_at: new Date(),
            })
            .where("id", "=", existing.id)
            .returningAll()
            .executeTakeFirstOrThrow()
        : await trx
            .insertInto("commerce.customers")
            .values({
              id: randomUUID(),
              first_name: firstName,
              last_name: lastName,
              phone,
              email,
              governorate,
              preferred_channel: quote.preferred_contact,
              tags: sql`cast(${JSON.stringify(tags)} as jsonb)` as unknown as string[],
              internal_notes: "",
              merged_into_customer_id: null,
              merged_at: null,
              created_at: new Date(),
              updated_at: new Date(),
            })
            .returningAll()
            .executeTakeFirstOrThrow();

      const addressCount = await trx
        .selectFrom("commerce.customer_addresses")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("customer_id", "=", customer.id)
        .executeTakeFirstOrThrow();
      if (Number.parseInt(String(addressCount.count), 10) === 0) {
        await trx
          .insertInto("commerce.customer_addresses")
          .values({
            id: randomUUID(),
            customer_id: customer.id,
            label: "Demande sur mesure",
            governorate: governorate || "À préciser",
            city: city || "À préciser",
            postal_code: null,
            address_line: "Adresse à confirmer",
            landmark: null,
            is_default: true,
            created_at: new Date(),
            updated_at: new Date(),
          })
          .executeTakeFirstOrThrow();
      }

      await trx
        .insertInto("commerce.customer_notes")
        .values({
          id: randomUUID(),
          customer_id: customer.id,
          body: `Converti depuis la demande ${quote.reference}. Ville indiquée : ${city || "à préciser"}.`,
          author_user_id: actorUserId,
          author_name: actorName.trim() || "Administration",
          created_at: new Date(),
        })
        .executeTakeFirstOrThrow();

      const updatedQuote = await trx
        .updateTable("commerce.custom_quote_requests")
        .set({
          customer_id: customer.id,
          converted_at: new Date(),
          converted_by: actorUserId,
        })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();

      return {
        quote: mapQuote(updatedQuote),
        customer: mapConversionCustomer(customer),
        action,
      };
    });
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
