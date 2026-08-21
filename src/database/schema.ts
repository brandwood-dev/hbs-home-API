import type { ColumnType, Generated } from "kysely";

type NullableTimestamp = ColumnType<
  Date | null,
  Date | string | null | undefined,
  Date | string | null
>;

export interface AdminProfileTable {
  auth_user_id: string;
  email: string;
  display_name: string | null;
  status: "invited" | "active" | "suspended" | "revoked";
  invited_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  last_seen_at: NullableTimestamp;
}

export interface RoleTable {
  key: string;
  name: string;
  description: string;
  is_system: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface PermissionTable {
  key: string;
  description: string;
  created_at: Generated<Date>;
}

export interface RolePermissionTable {
  role_key: string;
  permission_key: string;
  created_at: Generated<Date>;
}

export interface AdminUserRoleTable {
  id: Generated<string>;
  auth_user_id: string;
  role_key: string;
  granted_by: string | null;
  granted_at: Generated<Date>;
  expires_at: NullableTimestamp;
  revoked_at: NullableTimestamp;
  revoked_by: string | null;
}

export interface AuditEventTable {
  id: Generated<string>;
  occurred_at: Generated<Date>;
  request_id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  outcome: "success" | "denied" | "failure";
  source_ip: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
}

export interface CatalogProductTable {
  id: string;
  slug: string;
  is_published: Generated<boolean>;
  is_demo: Generated<boolean>;
  name: string;
  reference: string;
  short_description: string | null;
  long_description: string | null;
  image_alt: string | null;
  status: "draft" | "active" | "archived";
  category_id: string | null;
  published_at: NullableTimestamp;
  archived_at: NullableTimestamp;
  version: Generated<number>;
  category: string;
  material: string;
  opacity_level: string | null;
  selling_mode: string;
  pattern: string | null;
  blind_type: string | null;
  is_large_width: boolean;
  is_new: boolean;
  is_best_seller: boolean;
  is_featured: boolean;
  is_thermal: boolean;
  recommendation_score: number;
  product: Record<string, unknown>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CatalogCategoryTable {
  id: Generated<string>;
  slug: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  status: "draft" | "active" | "archived";
  sort_order: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CatalogAttributeTable {
  id: Generated<string>;
  key: string;
  name: string;
  value_type: "text" | "number" | "boolean" | "select" | "color" | "dimension";
  is_filterable: boolean;
  is_required: boolean;
  status: "draft" | "active" | "archived";
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CatalogAttributeOptionTable {
  id: Generated<string>;
  attribute_id: string;
  value: string;
  label: string;
  sort_order: number;
  created_at: Generated<Date>;
}

export interface CatalogProductCategoryTable {
  product_id: string;
  category_id: string;
  is_primary: boolean;
  created_at: Generated<Date>;
}

export interface CatalogCategoryAttributeTable {
  category_id: string;
  attribute_id: string;
  is_required: boolean;
  sort_order: number;
  created_at: Generated<Date>;
}

export interface CatalogProductAttributeTable {
  product_id: string;
  attribute_id: string;
  value: Record<string, unknown> | unknown[] | string | number | boolean;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CatalogProductVariantTable {
  id: Generated<string>;
  product_id: string;
  sku: string;
  title: string | null;
  price_amount_minor: number;
  compare_at_price_amount_minor: number | null;
  currency: "TND";
  status: "draft" | "active" | "archived";
  options: Record<string, unknown>;
  payload: Record<string, unknown>;
  is_default: boolean;
  sort_order: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CatalogProductMediaTable {
  id: Generated<string>;
  product_id: string;
  variant_id: string | null;
  storage_path: string;
  public_url: string | null;
  alt: string;
  media_type:
    | "front"
    | "lifestyle"
    | "fabric_detail"
    | "header_detail"
    | "mechanism_detail";
  status: "draft" | "active" | "archived";
  is_primary: boolean;
  sort_order: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type InventoryAvailability =
  "in_stock" | "low_stock" | "out_of_stock" | "made_to_order";

export interface StockBalanceTable {
  variant_id: string;
  product_id: string;
  on_hand: number;
  reserved: number;
  low_stock_threshold: number;
  track_inventory: boolean;
  availability: InventoryAvailability;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type StockMovementType =
  | "initial"
  | "adjustment_in"
  | "adjustment_out"
  | "reservation"
  | "reservation_release"
  | "sale"
  | "return"
  | "damage"
  | "correction";

export interface StockMovementTable {
  id: Generated<string>;
  variant_id: string;
  product_id: string;
  movement_type: StockMovementType;
  quantity: number;
  on_hand_delta: number;
  reserved_delta: number;
  previous_on_hand: number;
  resulting_on_hand: number;
  previous_reserved: number;
  resulting_reserved: number;
  reason: string;
  note: string | null;
  operation_key: string;
  request_fingerprint: string | null;
  order_id: string | null;
  actor_user_id: string | null;
  created_at: Generated<Date>;
}

export type ReservationStatus = "active" | "released" | "expired" | "converted";

export interface InventoryReservationTable {
  id: Generated<string>;
  reservation_key: string;
  order_id: string | null;
  status: ReservationStatus;
  expires_at: Date;
  released_at: NullableTimestamp;
  release_reason: string | null;
  converted_at: NullableTimestamp;
  request_fingerprint: string;
  actor_user_id: string | null;
  created_at: Generated<Date>;
}

export interface InventoryReservationItemTable {
  reservation_id: string;
  variant_id: string;
  product_id: string;
  quantity: number;
  created_at: Generated<Date>;
}

export type CartStatus = "active" | "expired" | "converted";

export interface CartTable {
  id: Generated<string>;
  token_hash: string;
  auth_user_id: string | null;
  status: CartStatus;
  currency: "TND";
  promo_code: string | null;
  expires_at: Date;
  last_accessed_at: Generated<Date>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CartItemTable {
  cart_id: string;
  product_id: string;
  variant_id: string;
  quantity: number;
  price_at_add_minor: number;
  added_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type PromotionDiscountType = "percentage" | "fixed_amount";

export interface PromotionTable {
  id: Generated<string>;
  name: string;
  code: string;
  discount_type: PromotionDiscountType;
  discount_value: number;
  currency: "TND";
  min_subtotal_minor: number;
  starts_at: Date | null;
  ends_at: Date | null;
  max_redemptions: number | null;
  redeemed_count: number;
  is_active: boolean;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type OrderStatus =
  | "pending_confirmation"
  | "confirmed"
  | "preparing"
  | "shipped"
  | "delivered"
  | "cancelled";

export interface CustomerTable {
  id: Generated<string>;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OrderTable {
  id: Generated<string>;
  order_number: string;
  customer_id: string;
  cart_id: string;
  status: OrderStatus;
  delivery_method: "home_delivery" | "store_pickup";
  payment_method: "cash_on_delivery";
  shipping_address: Record<string, unknown> | null;
  currency: "TND";
  subtotal_minor: number;
  discount_minor: number;
  shipping_minor: number;
  total_minor: number;
  promo_code: string | null;
  idempotency_key: string;
  request_fingerprint: string;
  reservation_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OrderItemTable {
  order_id: string;
  line_number: number;
  product_id: string;
  variant_id: string;
  product_slug: string;
  product_name: string;
  product_reference: string;
  sku: string;
  image_url: string;
  image_alt: string;
  category: string;
  color_label: string | null;
  width_cm: number | null;
  height_cm: number | null;
  curtain_header_label: string | null;
  eyelet_color_label: string | null;
  lining_label: string | null;
  selected_options: readonly { label: string; value: string }[];
  selling_unit_label: string;
  shipping_profile: string | null;
  quantity: number;
  unit_price_minor: number;
  line_total_minor: number;
  created_at: Generated<Date>;
}

export interface OrderStatusHistoryTable {
  id: Generated<string>;
  order_id: string;
  status: OrderStatus;
  reason: string | null;
  actor_user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Generated<Date>;
}

export interface OutboxEventTable {
  id: Generated<string>;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: "pending" | "processing" | "processed" | "dead_letter";
  attempts: number;
  available_at: Generated<Date>;
  processed_at: Date | null;
  last_error: string | null;
  created_at: Generated<Date>;
}

export interface DatabaseSchema {
  "iam.admin_profiles": AdminProfileTable;
  "iam.roles": RoleTable;
  "iam.permissions": PermissionTable;
  "iam.role_permissions": RolePermissionTable;
  "iam.admin_user_roles": AdminUserRoleTable;
  "audit.events": AuditEventTable;
  "catalog.categories": CatalogCategoryTable;
  "catalog.attributes": CatalogAttributeTable;
  "catalog.attribute_options": CatalogAttributeOptionTable;
  "catalog.products": CatalogProductTable;
  "catalog.product_categories": CatalogProductCategoryTable;
  "catalog.category_attributes": CatalogCategoryAttributeTable;
  "catalog.product_attributes": CatalogProductAttributeTable;
  "catalog.product_variants": CatalogProductVariantTable;
  "catalog.product_media": CatalogProductMediaTable;
  "inventory.stock_balances": StockBalanceTable;
  "inventory.stock_movements": StockMovementTable;
  "inventory.reservations": InventoryReservationTable;
  "inventory.reservation_items": InventoryReservationItemTable;
  "commerce.carts": CartTable;
  "commerce.cart_items": CartItemTable;
  "commerce.promotions": PromotionTable;
  "commerce.customers": CustomerTable;
  "commerce.orders": OrderTable;
  "commerce.order_items": OrderItemTable;
  "commerce.order_status_history": OrderStatusHistoryTable;
  "commerce.outbox_events": OutboxEventTable;
}
