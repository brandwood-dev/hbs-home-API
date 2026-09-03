import type { Kysely } from "kysely";
import type { DatabaseSchema } from "../database/schema.js";
import { AppError } from "../http/problem.js";

export type AdminSettingsPayload = Record<string, unknown>;

export interface StoreShippingSettings {
  standardFeeMinor: number;
  freeShippingThresholdMinor: number;
  estimatedDeliveryLabel: string;
  storePickupEnabled: boolean;
  pickupAddress: string;
}

export interface PublicStoreSettings {
  store: {
    name: string;
    currency: string;
    language: string;
    timezone: string;
    address: string;
  };
  shipping: StoreShippingSettings;
  contact: {
    phone: string;
    email: string;
    whatsapp: string;
    openingHours: string;
  };
  social: { facebook: string; instagram: string; tiktok: string };
  seo: { defaultTitle: string; defaultDescription: string; ogImageUrl: string };
  features: {
    checkout: boolean;
    favorites: boolean;
    reviews: boolean;
    customMade: boolean;
    professionals: boolean;
    orderTracking: boolean;
    customerAccounts: boolean;
    onlinePayment: boolean;
  };
}

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

export const DEFAULT_STORE_SHIPPING_SETTINGS: StoreShippingSettings = {
  standardFeeMinor: 7000,
  freeShippingThresholdMinor: 20000,
  estimatedDeliveryLabel: "Livraison sous 24 à 48 heures",
  storePickupEnabled: false,
  pickupAddress: "",
};

const EMPTY_SETTINGS: AdminSettingsDefaults = {
  store: {
    name: "HBS HOME",
    currency: "TND",
    language: "fr",
    timezone: "Africa/Tunis",
    address: "",
  },
  shipping: { ...DEFAULT_STORE_SHIPPING_SETTINGS },
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

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function shippingSettingsFromPayload(
  payload: AdminSettingsPayload | undefined,
): StoreShippingSettings {
  const shipping = recordValue(payload?.shipping);
  return {
    standardFeeMinor: nonNegativeInteger(
      shipping.standardFeeMinor,
      DEFAULT_STORE_SHIPPING_SETTINGS.standardFeeMinor,
    ),
    freeShippingThresholdMinor: nonNegativeInteger(
      shipping.freeShippingThresholdMinor,
      DEFAULT_STORE_SHIPPING_SETTINGS.freeShippingThresholdMinor,
    ),
    estimatedDeliveryLabel: stringValue(
      shipping.estimatedDeliveryLabel,
      DEFAULT_STORE_SHIPPING_SETTINGS.estimatedDeliveryLabel,
    ),
    storePickupEnabled: booleanValue(
      shipping.storePickupEnabled,
      DEFAULT_STORE_SHIPPING_SETTINGS.storePickupEnabled,
    ),
    pickupAddress: stringValue(
      shipping.pickupAddress,
      DEFAULT_STORE_SHIPPING_SETTINGS.pickupAddress,
    ),
  };
}

export function publicStoreSettingsFromPayload(
  payload: AdminSettingsPayload | undefined,
): PublicStoreSettings {
  const value = withDefaultSettings(payload ?? {});
  const store = recordValue(value.store);
  const contact = recordValue(value.contact);
  const social = recordValue(value.social);
  const seo = recordValue(value.seo);
  const features = recordValue(value.features);
  return {
    store: {
      name: stringValue(store.name, "HBS HOME"),
      currency: stringValue(store.currency, "TND"),
      language: stringValue(store.language, "fr"),
      timezone: stringValue(store.timezone, "Africa/Tunis"),
      address: stringValue(store.address, ""),
    },
    shipping: shippingSettingsFromPayload(value),
    contact: {
      phone: stringValue(contact.phone, ""),
      email: stringValue(contact.email, ""),
      whatsapp: stringValue(contact.whatsapp, ""),
      openingHours: stringValue(contact.openingHours, ""),
    },
    social: {
      facebook: stringValue(social.facebook, ""),
      instagram: stringValue(social.instagram, ""),
      tiktok: stringValue(social.tiktok, ""),
    },
    seo: {
      defaultTitle: stringValue(seo.defaultTitle, "HBS HOME"),
      defaultDescription: stringValue(seo.defaultDescription, ""),
      ogImageUrl: stringValue(seo.ogImageUrl, ""),
    },
    features: {
      checkout: booleanValue(features.checkout, true),
      favorites: booleanValue(features.favorites, true),
      reviews: booleanValue(features.reviews, false),
      customMade: booleanValue(features.customMade, true),
      professionals: booleanValue(features.professionals, false),
      orderTracking: booleanValue(features.orderTracking, true),
      customerAccounts: booleanValue(features.customerAccounts, false),
      onlinePayment: booleanValue(features.onlinePayment, false),
    },
  };
}

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
