import { randomUUID } from "node:crypto";
import { sql, type Kysely, type Selectable } from "kysely";
import type {
  DatabaseSchema,
  CustomQuoteRequestTable,
} from "../database/schema.js";
import { AppError } from "../http/problem.js";

export type CustomQuoteProductType =
  "rideaux" | "voilages" | "stores" | "ensemble_fenetre";
export type CustomQuotePreferredContact = "phone" | "whatsapp" | "email";
export type CustomQuoteRequestType = "particulier" | "professionnels";

export type ProfessionalActivity =
  | "hotellerie"
  | "restauration"
  | "bureaux"
  | "architecte"
  | "decorateur"
  | "promoteur"
  | "commerce"
  | "autre";
export type ProfessionalProjectVolume =
  "moins_10" | "10_50" | "50_200" | "plus_200";

export interface ProfessionalDetails {
  companyName: string;
  activity: ProfessionalActivity;
  taxId?: string;
  projectVolume: ProfessionalProjectVolume;
  desiredDeadline?: string;
  message: string;
}

export interface ProfessionalLeadInput extends ProfessionalDetails {
  contactName: string;
  phone: string;
  email: string;
  governorate: string;
  city?: string;
  acceptedPrivacy: true;
}

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
  requestType: CustomQuoteRequestType;
  professionalDetails?: ProfessionalDetails;
  createdAt: string;
  readAt: string | null;
  archivedAt: string | null;
  emailSentAt: string | null;
  customerId: string | null;
  convertedAt: string | null;
  convertedBy: string | null;
}

export interface CustomQuoteCustomerSummary {
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
  customer: CustomQuoteCustomerSummary;
  action: "created" | "associated" | "already_associated";
}

export interface CustomQuoteListParams {
  page: number;
  pageSize: number;
  query?: string;
  unreadOnly?: boolean;
  includeArchived?: boolean;
  requestType?: CustomQuoteRequestType;
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
  const professionalDetails = objectValue(row.professional_details);
  return {
    id: row.id,
    reference: row.reference,
    requestType: row.request_type,
    ...(row.request_type === "professionnels" &&
    Object.keys(professionalDetails).length > 0
      ? {
          professionalDetails:
            professionalDetails as unknown as ProfessionalDetails,
        }
      : {}),
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

function customerPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("216") && digits.length === 11) return `+${digits}`;
  if (digits.length === 8) return `+216${digits}`;
  throw new AppError({
    statusCode: 400,
    code: "INVALID_CUSTOMER_PHONE",
    title: "Numéro de téléphone invalide",
    detail: "Le numéro de téléphone doit être un numéro tunisien à 8 chiffres.",
  });
}

function customerSummary(row: {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  governorate: string;
  preferred_channel: CustomQuotePreferredContact | null;
}): CustomQuoteCustomerSummary {
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

function quoteReference(
  prefix: "DEV" | "PRO" = "DEV",
  date = new Date(),
): string {
  const day = `${String(date.getFullYear())}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `${prefix}-${day}-${randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`;
}

function normalized(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizedMultiline(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/[ \t]+/g, " "))
    .join("\n")
    .trim();
}

export class PostgresCustomQuoteRepository {
  constructor(private readonly database: Kysely<DatabaseSchema>) {}

  async create(input: CustomQuoteInput): Promise<CustomQuoteRequest> {
    return this.createRequest(input, "particulier");
  }

  async createProfessional(
    input: ProfessionalLeadInput,
  ): Promise<CustomQuoteRequest> {
    const contact = normalized(input.contactName).split(" ");
    const firstName = contact.shift() ?? "Contact";
    const lastName = contact.join(" ") || "Professionnel";
    return this.createRequest(
      {
        productType: "ensemble_fenetre",
        openings: [],
        preferences: {
          wantsAccessories: false,
        },
        contact: {
          firstName,
          lastName,
          phone: input.phone,
          email: input.email,
          governorate: input.governorate,
          city: input.city?.trim() ?? "Non précisée",
          preferredContact: "email",
        },
        attachmentMetadata: [],
        acceptedPrivacy: true,
      },
      "professionnels",
      {
        companyName: normalized(input.companyName),
        activity: input.activity,
        ...(input.taxId?.trim() ? { taxId: normalized(input.taxId) } : {}),
        projectVolume: input.projectVolume,
        ...(input.desiredDeadline?.trim()
          ? { desiredDeadline: normalized(input.desiredDeadline) }
          : {}),
        message: normalizedMultiline(input.message),
      },
    );
  }

  private async createRequest(
    input: CustomQuoteInput,
    requestType: CustomQuoteRequestType,
    professionalDetails?: ProfessionalDetails,
  ): Promise<CustomQuoteRequest> {
    const id = randomUUID();
    const reference = quoteReference(
      requestType === "professionnels" ? "PRO" : "DEV",
    );
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
          request_type: requestType,
          professional_details: professionalDetails
            ? (sql`cast(${JSON.stringify(professionalDetails)} as jsonb)` as unknown as Record<
                string,
                unknown
              >)
            : null,
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
      .$if(params.requestType !== undefined, (builder) =>
        builder.where("request_type", "=", params.requestType ?? "particulier"),
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

  async convertToCustomer(
    id: string,
    convertedBy: string,
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
        let linked = await trx
          .selectFrom("commerce.customers")
          .selectAll()
          .where("id", "=", quote.customer_id)
          .executeTakeFirstOrThrow();
        const visited = new Set<string>();
        while (linked.merged_into_customer_id && !visited.has(linked.id)) {
          visited.add(linked.id);
          linked = await trx
            .selectFrom("commerce.customers")
            .selectAll()
            .where("id", "=", linked.merged_into_customer_id)
            .executeTakeFirstOrThrow();
        }
        const linkedQuote =
          linked.id === quote.customer_id
            ? quote
            : await trx
                .updateTable("commerce.custom_quote_requests")
                .set({ customer_id: linked.id })
                .where("id", "=", id)
                .returningAll()
                .executeTakeFirstOrThrow();
        return {
          quote: mapQuote(linkedQuote),
          customer: customerSummary(linked),
          action: "already_associated" as const,
        };
      }

      const phone = customerPhone(quote.phone);
      const email = quote.email?.trim().toLowerCase() ?? null;
      const existing = await trx
        .selectFrom("commerce.customers")
        .selectAll()
        .where((eb) =>
          eb.or([
            eb("phone", "=", phone),
            ...(email ? [eb("email", "=", email)] : []),
          ]),
        )
        .orderBy("created_at", "asc")
        .executeTakeFirst();

      const customer =
        existing ??
        (await trx
          .insertInto("commerce.customers")
          .values({
            id: randomUUID(),
            first_name: quote.first_name,
            last_name: quote.last_name,
            phone,
            email,
            governorate: quote.governorate,
            preferred_channel: quote.preferred_contact,
            tags: sql`cast(${JSON.stringify([])} as jsonb)` as unknown as string[],
            internal_notes: `Prospect converti depuis la demande ${quote.reference}.`,
          })
          .returningAll()
          .executeTakeFirstOrThrow());

      const updated = await trx
        .updateTable("commerce.custom_quote_requests")
        .set({
          customer_id: customer.id,
          converted_at: new Date(),
          converted_by: convertedBy,
        })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();

      return {
        quote: mapQuote(updated),
        customer: customerSummary(customer),
        action: existing ? ("associated" as const) : ("created" as const),
      };
    });
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
