import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import {
  publicStoreSettingsFromPayload,
  type AdminSettingsRepository,
  type PublicStoreSettings,
} from "../settings/admin-settings-repository.js";

const StoreSchema = Type.Object(
  {
    name: Type.String(),
    currency: Type.String(),
    language: Type.String(),
    timezone: Type.String(),
    address: Type.String(),
  },
  { additionalProperties: false },
);

const ShippingSchema = Type.Object(
  {
    standardFeeMinor: Type.Integer({ minimum: 0 }),
    freeShippingThresholdMinor: Type.Integer({ minimum: 0 }),
    estimatedDeliveryLabel: Type.String(),
    storePickupEnabled: Type.Boolean(),
    pickupAddress: Type.String(),
  },
  { additionalProperties: false },
);

const ContactSchema = Type.Object(
  {
    phone: Type.String(),
    email: Type.String(),
    whatsapp: Type.String(),
    openingHours: Type.String(),
  },
  { additionalProperties: false },
);

const SocialSchema = Type.Object(
  {
    facebook: Type.String(),
    instagram: Type.String(),
    tiktok: Type.String(),
  },
  { additionalProperties: false },
);

const SeoSchema = Type.Object(
  {
    defaultTitle: Type.String(),
    defaultDescription: Type.String(),
    ogImageUrl: Type.String(),
  },
  { additionalProperties: false },
);

const FeaturesSchema = Type.Object(
  {
    checkout: Type.Boolean(),
    favorites: Type.Boolean(),
    reviews: Type.Boolean(),
    customMade: Type.Boolean(),
    professionals: Type.Boolean(),
    orderTracking: Type.Boolean(),
    customerAccounts: Type.Boolean(),
    onlinePayment: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const PublicStoreSettingsSchema = Type.Object(
  {
    store: StoreSchema,
    shipping: ShippingSchema,
    contact: ContactSchema,
    social: SocialSchema,
    seo: SeoSchema,
    features: FeaturesSchema,
  },
  { $id: "PublicStoreSettings", additionalProperties: false },
);

export interface StoreSettingsRouteDependencies {
  adminSettingsRepository: AdminSettingsRepository;
}

export function registerStoreSettingsRoutes(
  app: FastifyInstance,
  dependencies: StoreSettingsRouteDependencies,
): void {
  app.addSchema(PublicStoreSettingsSchema);
  app.get<{ Reply: PublicStoreSettings }>(
    "/api/v1/store/settings",
    {
      schema: {
        operationId: "getStoreSettings",
        summary: "Return the public store settings",
        tags: ["store-settings"],
        response: { 200: PublicStoreSettingsSchema },
      },
    },
    async (_request, reply) => {
      reply.header("cache-control", "no-store");
      const record = await dependencies.adminSettingsRepository.get();
      return publicStoreSettingsFromPayload(record.payload);
    },
  );
}
