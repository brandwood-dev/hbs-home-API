import type { Kysely } from "kysely";
import type { DatabaseSchema } from "../database/schema.js";
import { AppError } from "../http/problem.js";

export type AdminSettingsPayload = Record<string, unknown>;

export interface AdminSettingsRecord {
  payload: AdminSettingsPayload;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
}

export interface AdminSettingsRepository {
  get(): Promise<AdminSettingsRecord>;
  update(
    payload: AdminSettingsPayload,
    actorUserId: string,
    expectedVersion?: number,
  ): Promise<AdminSettingsRecord>;
}

interface AdminSettingsDefaults {
  store: Record<string, unknown>;
  shipping: Record<string, unknown>;
  contact: Record<string, unknown>;
  social: Record<string, unknown>;
  seo: Record<string, unknown>;
  features: Record<string, unknown>;
}

const EMPTY_SETTINGS: AdminSettingsDefaults = {
  store: {
    name: "HBS HOME",
    currency: "TND",
    language: "fr",
    timezone: "Africa/Tunis",
    address: "",
  },
  shipping: {
    standardFeeMinor: 7000,
    freeShippingThresholdMinor: 20000,
    estimatedDeliveryLabel: "Livraison sous 24 à 48 heures",
    storePickupEnabled: false,
    pickupAddress: "",
  },
  contact: { phone: "", email: "", whatsapp: "", openingHours: "" },
  social: { facebook: "", instagram: "", tiktok: "" },
  seo: { defaultTitle: "HBS HOME", defaultDescription: "", ogImageUrl: "" },
  features: {
    checkout: true,
    favorites: true,
    reviews: false,
    customMade: true,
    professionals: false,
    orderTracking: true,
    customerAccounts: false,
    onlinePayment: false,
  },
};

function withDefaultSettings(
  payload: AdminSettingsPayload,
): AdminSettingsPayload {
  const value = payload as Partial<AdminSettingsDefaults>;
  return {
    ...EMPTY_SETTINGS,
    ...value,
    store: { ...EMPTY_SETTINGS.store, ...(value.store ?? {}) },
    shipping: { ...EMPTY_SETTINGS.shipping, ...(value.shipping ?? {}) },
    contact: { ...EMPTY_SETTINGS.contact, ...(value.contact ?? {}) },
    social: { ...EMPTY_SETTINGS.social, ...(value.social ?? {}) },
    seo: { ...EMPTY_SETTINGS.seo, ...(value.seo ?? {}) },
    features: { ...EMPTY_SETTINGS.features, ...(value.features ?? {}) },
  };
}

function containsSensitiveKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsSensitiveKey);
  return Object.entries(value).some(
    ([key, child]) =>
      /(?:secret|credential|password|token)/i.test(key) ||
      containsSensitiveKey(child),
  );
}

function recordFromRow(row: {
  payload: Record<string, unknown>;
  version: number;
  updated_at: Date;
  updated_by: string | null;
}): AdminSettingsRecord {
  return {
    payload: withDefaultSettings(row.payload),
    version: row.version,
    updatedAt: row.updated_at.toISOString(),
    updatedBy: row.updated_by,
  };
}

export class PostgresAdminSettingsRepository implements AdminSettingsRepository {
  constructor(private readonly database: Kysely<DatabaseSchema>) {}

  async get(): Promise<AdminSettingsRecord> {
    const row = await this.database
      .selectFrom("iam.admin_settings")
      .select(["payload", "version", "updated_at", "updated_by"])
      .where("id", "=", 1)
      .executeTakeFirst();

    if (!row) {
      return {
        payload: withDefaultSettings({}),
        version: 1,
        updatedAt: new Date(0).toISOString(),
        updatedBy: null,
      };
    }
    return recordFromRow(row);
  }

  async update(
    payload: AdminSettingsPayload,
    actorUserId: string,
    expectedVersion?: number,
  ): Promise<AdminSettingsRecord> {
    if (containsSensitiveKey(payload)) {
      throw new AppError({
        statusCode: 400,
        code: "SETTINGS_SECRET_FIELD",
        title: "Invalid settings payload",
        detail: "Secrets and credentials cannot be stored in Admin settings.",
      });
    }

    return this.database.transaction().execute(async (trx) => {
      const current = await trx
        .selectFrom("iam.admin_settings")
        .select(["payload", "version", "updated_at", "updated_by"])
        .where("id", "=", 1)
        .forUpdate()
        .executeTakeFirst();
      const version = current?.version ?? 1;
      if (expectedVersion !== undefined && expectedVersion !== version) {
        throw new AppError({
          statusCode: 409,
          code: "SETTINGS_VERSION_CONFLICT",
          title: "Settings changed",
          detail: "Reload the settings before saving them again.",
        });
      }

      const row = await trx
        .insertInto("iam.admin_settings")
        .values({
          id: 1,
          payload,
          version: version + 1,
          updated_by: actorUserId,
        })
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            payload,
            version: version + 1,
            updated_by: actorUserId,
            updated_at: new Date(),
          }),
        )
        .returning(["payload", "version", "updated_at", "updated_by"])
        .executeTakeFirstOrThrow();
      return recordFromRow(row);
    });
  }
}
