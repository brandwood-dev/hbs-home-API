import { sql, type Kysely } from "kysely";
import type { DatabaseSchema } from "../database/schema.js";

export type ProductSort =
  | "recommended"
  | "newest"
  | "best_sellers"
  | "price_asc"
  | "price_desc"
  | "discount";

export interface ProductListParams {
  page: number;
  pageSize: number;
  sort: ProductSort;

  /** Public catalogue search text. Kept on the product query so filters and pagination stay server-side. */
  query?: string | undefined;

  categories?: readonly string[] | undefined;
  materials?: readonly string[] | undefined;
  colors?: readonly string[] | undefined;
  opacityLevels?: readonly string[] | undefined;
  curtainHeaders?: readonly string[] | undefined;
  patterns?: readonly string[] | undefined;
  blindTypes?: readonly string[] | undefined;
  shapes?: readonly string[] | undefined;
  cushionContents?: readonly string[] | undefined;
  chairPadFastenings?: readonly string[] | undefined;
  accessoryTypes?: readonly string[] | undefined;
  accessoryFinishes?: readonly string[] | undefined;
  mountings?: readonly string[] | undefined;
  controlSides?: readonly string[] | undefined;
  widths?: readonly number[] | undefined;
  heights?: readonly number[] | undefined;
  availability?: readonly string[] | undefined;
  minPriceMinor?: number | undefined;
  maxPriceMinor?: number | undefined;
  sellingMode?: readonly string[] | undefined;
  onlyNew?: boolean | undefined;
  onlyBestSellers?: boolean | undefined;
  onlyDiscounted?: boolean | undefined;
  onlyThermal?: boolean | undefined;
  onlyLargeWidth?: boolean | undefined;
  ids?: readonly string[] | undefined;
  plantCareLevels?: readonly string[] | undefined;
  plantLightNeeds?: readonly string[] | undefined;
  plantNatures?: readonly string[] | undefined;
  plantTypes?: readonly string[] | undefined;
  plantSizes?: readonly string[] | undefined;
  furnitureTypes?: readonly string[] | undefined;
  furnitureRooms?: readonly string[] | undefined;
  furnitureStyles?: readonly string[] | undefined;
}

export interface CatalogScope {
  categories?: readonly string[] | undefined;
  materials?: readonly string[] | undefined;
  opacityLevels?: readonly string[] | undefined;
  curtainHeaders?: readonly string[] | undefined;
  patterns?: readonly string[] | undefined;
  blindTypes?: readonly string[] | undefined;
  shapes?: readonly string[] | undefined;
  accessoryTypes?: readonly string[] | undefined;
  furnitureTypes?: readonly string[] | undefined;
  furnitureRooms?: readonly string[] | undefined;
  furnitureStyles?: readonly string[] | undefined;
  plantNatures?: readonly string[] | undefined;
  plantTypes?: readonly string[] | undefined;
  plantSizes?: readonly string[] | undefined;
  sellingMode?: readonly string[] | undefined;
  onlyThermal?: boolean | undefined;
  onlyLargeWidth?: boolean | undefined;
}

export interface PaginatedProducts {
  items: Product[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** Counts by category for a search result set. Present when `query` is provided. */
  categoryCounts?: Record<string, number>;
}

export interface ProductPrice {
  amountMinor: number;
  currency: "TND";
}

export interface ProductVariant {
  id: string;
  sku: string;
  colorId: string;
  widthCm: number;
  heightCm: number;
  curtainHeader?: string;
  eyeletColor?: string;
  lining?: string;
  blindMountingType?: string;
  blindControlSide?: string;
  blindMechanismColor?: string;
  sizeLabel?: string;
  cushionContent?: string;
  cushionClosure?: string;
  chairPadFastening?: string;
  accessoryFinish?: string;
  accessoryMountingType?: string;
  minLengthCm?: number;
  maxLengthCm?: number;
  diameterMm?: number;
  depthCm?: number;
  seatCount?: number;
  plantHeightCm?: number;
  potDiameterCm?: number;
  plantSize?: string;
  packQuantity?: number;
  price: ProductPrice;
  compareAtPrice?: ProductPrice;
  availability: string;
  availableQuantity: number;
  imageUrl: string;
  secondaryImageUrl?: string;
  imageIds: readonly string[];
}

export interface ProductImage {
  id: string;
  url: string;
  alt: string;
  type:
    | "front"
    | "lifestyle"
    | "fabric_detail"
    | "header_detail"
    | "mechanism_detail";
  colorId?: string;
}

export interface ProductColor {
  id: string;
  name: string;
  slug: string;
  family: string;
  hex: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  reference: string;
  category: string;
  material: string;
  opacityLevel?: string;
  sellingMode: string;
  pattern?: string;
  blindType?: string;
  isLargeWidth: boolean;
  cushionShape?: string;
  removableCover?: boolean;
  machineWashable?: boolean;
  chairPadShape?: string;
  accessoryType?: string;
  accessoryMaterial?: string;
  accessoryCompatibilities?: readonly string[];
  furnitureType?: string;
  furnitureRooms?: readonly string[];
  furnitureStyle?: string;
  furnitureAssembly?: string;
  plantNature?: string;
  plantType?: string;
  plantLightNeed?: string;
  plantCareLevel?: string;
  petFriendly?: boolean;
  potIncluded?: boolean;
  shortDescription: string;
  longDescription: string;
  imageAlt: string;
  images: readonly ProductImage[];
  variants: readonly ProductVariant[];
  colors: readonly ProductColor[];
  details: Record<string, unknown>;
  /** Attributs de catalogue normalisés, projetés pour la recherche et les filtres. */
  attributes: Record<string, unknown>;
  seo: { title: string; description: string };
  isThermal: boolean;
  isNew: boolean;
  isBestSeller: boolean;
  isFeatured: boolean;
  createdAt: string;
  recommendationScore: number;
  isDemo: boolean;
}

export interface ProductRepository {
  listProducts(params: ProductListParams): Promise<PaginatedProducts>;
  getBySlug(slug: string): Promise<Product | null>;
  getByIds(ids: readonly string[]): Promise<Product[]>;
  listRelated(slug: string, limit: number): Promise<Product[]>;
  listScope(scope?: CatalogScope): Promise<Product[]>;
}

interface CatalogProductRow {
  id: string;
  slug: string;
  is_published: boolean;
  is_demo: boolean;
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
  created_at: string | Date;
}

type UnknownRecord = Record<string, unknown>;

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value))
    return Math.trunc(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  }
  return fallback;
}

function asRecord(value: unknown): UnknownRecord {
  if (typeof value === "object" && value !== null)
    return value as UnknownRecord;
  return {};
}

function toArrayString(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asString(entry))
    .filter(
      (entry): entry is string => typeof entry === "string" && entry.length > 0,
    )
    .map((entry) => entry);
}

function toObjectArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function uniqueList<T>(
  values: readonly T[] | undefined,
): readonly T[] | undefined {
  if (!values || values.length === 0) return undefined;
  return [...new Set(values)];
}

function parseMoney(value: unknown): ProductPrice {
  const record = asRecord(value);
  const amount = asNumber(record.amountMinor, 0);
  return { amountMinor: Math.max(0, amount), currency: "TND" };
}

function parseImage(value: unknown): ProductImage | null {
  const image = asRecord(value);
  const id = asString(image.id);
  const url = asString(image.url);
  const alt = asString(image.alt);
  const type = asString(image.type) ?? "front";

  if (!id || !url || !alt) return null;
  const productImage: ProductImage = {
    id,
    url,
    alt,
    type:
      type === "front" ||
      type === "lifestyle" ||
      type === "fabric_detail" ||
      type === "header_detail" ||
      type === "mechanism_detail"
        ? type
        : "front",
  };
  const colorId = asString(image.colorId);
  if (colorId) productImage.colorId = colorId;
  return productImage;
}

function parseColor(value: unknown): ProductColor | null {
  const color = asRecord(value);
  const id = asString(color.id);
  const name = asString(color.name);
  const slug = asString(color.slug);
  const family = asString(color.family);
  const hex = asString(color.hex);
  if (!id || !name || !slug || !family || !hex) return null;
  return { id, name, slug, family, hex };
}

function parseVariant(value: unknown): ProductVariant | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  const colorId = asString(record.colorId) ?? asString(record.color_id);
  if (!colorId) return null;

  const widthCm = asNumber(record.widthCm, asNumber(record.width, 0));
  const heightCm = asNumber(record.heightCm, asNumber(record.height, 0));
  const availability = asString(record.availability) ?? "out_of_stock";
  const rawImageUrl = asString(record.imageUrl) ?? asString(record.image_url);
  const imageUrl =
    rawImageUrl && rawImageUrl.length > 0
      ? rawImageUrl
      : "/images/placeholder.jpg";
  const price = parseMoney(record.price);

  const variant: ProductVariant = {
    id,
    sku: asString(record.sku) ?? id,
    colorId,
    widthCm,
    heightCm,
    availability,
    availableQuantity: Math.max(
      0,
      asNumber(
        record.availableQuantity,
        asNumber(record.available_quantity, 0),
      ),
    ),
    imageUrl,
    imageIds: toArrayString(record.imageIds),
    price,
  };

  const compareAt = parseMoney(record.compareAtPrice);
  if (compareAt.amountMinor > 0) variant.compareAtPrice = compareAt;

  const curtainHeader =
    asString(record.curtainHeader) ?? asString(record.curtain_header);
  if (curtainHeader) variant.curtainHeader = curtainHeader;
  const eyeletColor =
    asString(record.eyeletColor) ?? asString(record.eyelet_color);
  if (eyeletColor) variant.eyeletColor = eyeletColor;
  const lining = asString(record.lining);
  if (lining) variant.lining = lining;
  const blindMountingType =
    asString(record.blindMountingType) ?? asString(record.blind_mounting_type);
  if (blindMountingType) variant.blindMountingType = blindMountingType;
  const blindControlSide =
    asString(record.blindControlSide) ?? asString(record.blind_control_side);
  if (blindControlSide) variant.blindControlSide = blindControlSide;
  const blindMechanismColor =
    asString(record.blindMechanismColor) ??
    asString(record.blind_mechanism_color);
  if (blindMechanismColor) variant.blindMechanismColor = blindMechanismColor;
  const sizeLabel = asString(record.sizeLabel) ?? asString(record.size_label);
  if (sizeLabel) variant.sizeLabel = sizeLabel;

  const cushionContent =
    asString(record.cushionContent) ?? asString(record.cushion_content);
  if (cushionContent) variant.cushionContent = cushionContent;
  const cushionClosure =
    asString(record.cushionClosure) ?? asString(record.cushion_closure);
  if (cushionClosure) variant.cushionClosure = cushionClosure;
  const chairPadFastening =
    asString(record.chairPadFastening) ?? asString(record.chair_pad_fastening);
  if (chairPadFastening) variant.chairPadFastening = chairPadFastening;
  const accessoryFinish =
    asString(record.accessoryFinish) ?? asString(record.accessory_finish);
  if (accessoryFinish) variant.accessoryFinish = accessoryFinish;
  const accessoryMountingType =
    asString(record.accessoryMountingType) ??
    asString(record.accessory_mounting_type);
  if (accessoryMountingType)
    variant.accessoryMountingType = accessoryMountingType;

  const minLengthCm = asNumber(
    record.minLengthCm,
    asNumber(record.min_length, Number.NaN),
  );
  if (Number.isFinite(minLengthCm)) variant.minLengthCm = minLengthCm;
  const maxLengthCm = asNumber(
    record.maxLengthCm,
    asNumber(record.max_length, Number.NaN),
  );
  if (Number.isFinite(maxLengthCm)) variant.maxLengthCm = maxLengthCm;
  const diameterMm = asNumber(
    record.diameterMm,
    asNumber(record.diameter_mm, Number.NaN),
  );
  if (Number.isFinite(diameterMm)) variant.diameterMm = diameterMm;
  const depthCm = asNumber(
    record.depthCm,
    asNumber(record.depth_cm, Number.NaN),
  );
  if (Number.isFinite(depthCm)) variant.depthCm = depthCm;
  const seatCount = asNumber(
    record.seatCount,
    asNumber(record.seat_count, Number.NaN),
  );
  if (Number.isFinite(seatCount)) variant.seatCount = seatCount;
  const plantHeightCm = asNumber(
    record.plantHeightCm,
    asNumber(record.plant_height_cm, Number.NaN),
  );
  if (Number.isFinite(plantHeightCm)) variant.plantHeightCm = plantHeightCm;
  const potDiameterCm = asNumber(
    record.potDiameterCm,
    asNumber(record.pot_diameter_cm, Number.NaN),
  );
  if (Number.isFinite(potDiameterCm)) variant.potDiameterCm = potDiameterCm;
  const plantSize = asString(record.plantSize) ?? asString(record.plant_size);
  if (plantSize) variant.plantSize = plantSize;
  const packQuantity = asNumber(
    record.packQuantity,
    asNumber(record.pack_quantity, Number.NaN),
  );
  if (Number.isFinite(packQuantity)) variant.packQuantity = packQuantity;
  const secondaryImageUrl =
    asString(record.secondaryImageUrl) ?? asString(record.secondary_image_url);
  if (secondaryImageUrl) variant.secondaryImageUrl = secondaryImageUrl;

  return variant;
}

function mergeString(first: unknown, second: unknown): string | undefined {
  return asString(first) ?? asString(second);
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  const candidate = asString(value)?.toLowerCase();
  if (candidate === "true") return true;
  if (candidate === "false") return false;
  return fallback;
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  const candidate = asString(value)?.toLowerCase();
  if (candidate === "true") return true;
  if (candidate === "false") return false;
  return undefined;
}

function parseProduct(row: CatalogProductRow): Product | null {
  const payload = asRecord(row.product);
  const details = asRecord(payload.details);
  const attributes = asRecord(payload.attributes);
  const seo = asRecord(payload.seo);

  const id = row.id.trim();
  const name = mergeString(payload.name, row.slug) ?? row.slug;
  const reference = mergeString(payload.reference, row.slug) ?? "N/A";
  const slug = mergeString(payload.slug, row.slug) ?? row.slug;
  const category =
    mergeString(payload.category, row.category) ?? "mobilier_interieur";
  const material = mergeString(payload.material, row.material) ?? "textile";
  const sellingMode =
    mergeString(payload.sellingMode, row.selling_mode) ?? "ready_made";

  const shortDescription =
    mergeString(payload.shortDescription, payload.short_description) ?? "";
  const longDescription =
    mergeString(payload.longDescription, payload.long_description) ??
    shortDescription;
  const imageAlt =
    mergeString(payload.imageAlt, payload.image_alt) ?? `Produit ${name}`;

  const images = toObjectArray(payload.images).map((entry) => {
    const image = parseImage(entry);
    return image;
  });
  const variants = toObjectArray(payload.variants).map((entry) => {
    const variant = parseVariant(entry);
    return variant;
  });
  const colors = toObjectArray(payload.colors).map((entry) =>
    parseColor(entry),
  );

  const product: Product = {
    id,
    slug,
    name,
    reference,
    category,
    material,
    sellingMode,
    isLargeWidth: parseBoolean(payload.isLargeWidth, row.is_large_width),
    shortDescription,
    longDescription,
    imageAlt,
    images: images.filter((value): value is ProductImage => value !== null),
    variants: variants.filter(
      (value): value is ProductVariant => value !== null,
    ),
    colors: colors.filter((value): value is ProductColor => value !== null),
    details: details,
    attributes,
    seo: {
      title: mergeString(seo.title, row.slug) ?? `${name} — ${category}`,
      description:
        mergeString(seo.description, shortDescription) ?? shortDescription,
    },
    isThermal: parseBoolean(payload.isThermal, row.is_thermal),
    isNew: parseBoolean(payload.isNew, row.is_new),
    isBestSeller: parseBoolean(payload.isBestSeller, row.is_best_seller),
    isFeatured: parseBoolean(payload.isFeatured, row.is_featured),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : (mergeString(payload.createdAt, row.created_at) ??
          new Date().toISOString()),
    recommendationScore: asNumber(
      payload.recommendationScore,
      row.recommendation_score,
    ),
    isDemo: parseBoolean(payload.isDemo, row.is_demo),
  };

  const pattern = mergeString(payload.pattern, payload.patternName);
  if (pattern) product.pattern = pattern;
  const blindType = mergeString(payload.blindType, payload.blind_type);
  if (blindType) product.blindType = blindType;
  const opacityLevel = mergeString(payload.opacityLevel, payload.opacity_level);
  if (opacityLevel) product.opacityLevel = opacityLevel;
  const cushionShape = mergeString(payload.cushionShape, payload.chairPadShape);
  if (cushionShape) product.cushionShape = cushionShape;
  const removableCover = parseOptionalBoolean(
    payload.removableCover ?? payload.removable_cover,
  );
  if (removableCover !== undefined) {
    product.removableCover = removableCover;
  }
  const machineWashable = parseOptionalBoolean(
    payload.machineWashable ?? payload.machine_washable,
  );
  if (machineWashable !== undefined) {
    product.machineWashable = machineWashable;
  }
  const chairPadShape = mergeString(
    payload.chairPadShape,
    payload.chair_pad_shape,
  );
  if (chairPadShape) product.chairPadShape = chairPadShape;
  const accessoryType = mergeString(
    payload.accessoryType,
    payload.accessory_type,
  );
  if (accessoryType) product.accessoryType = accessoryType;
  const accessoryMaterial = mergeString(
    payload.accessoryMaterial,
    payload.accessory_material,
  );
  if (accessoryMaterial) product.accessoryMaterial = accessoryMaterial;
  const accessoryCompatibilities = uniqueList(
    toArrayString(payload.accessoryCompatibilities),
  );
  if (accessoryCompatibilities?.length) {
    product.accessoryCompatibilities = accessoryCompatibilities;
  }
  const furnitureType = mergeString(
    payload.furnitureType,
    payload.furniture_type,
  );
  if (furnitureType) product.furnitureType = furnitureType;
  const furnitureRooms = uniqueList(
    toArrayString(payload.furnitureRooms ?? payload.furniture_rooms),
  );
  if (furnitureRooms?.length) product.furnitureRooms = furnitureRooms;
  const furnitureStyle = mergeString(
    payload.furnitureStyle,
    payload.furniture_style,
  );
  if (furnitureStyle) product.furnitureStyle = furnitureStyle;
  const furnitureAssembly = mergeString(
    payload.furnitureAssembly,
    payload.furniture_assembly,
  );
  if (furnitureAssembly) product.furnitureAssembly = furnitureAssembly;
  const plantNature = mergeString(payload.plantNature, payload.plant_nature);
  if (plantNature) product.plantNature = plantNature;
  const plantType = mergeString(payload.plantType, payload.plant_type);
  if (plantType) product.plantType = plantType;
  const plantLightNeed = mergeString(
    payload.plantLightNeed,
    payload.plant_light_need,
  );
  if (plantLightNeed) product.plantLightNeed = plantLightNeed;
  const plantCareLevel = mergeString(
    payload.plantCareLevel,
    payload.plant_care_level,
  );
  if (plantCareLevel) product.plantCareLevel = plantCareLevel;
  const petFriendly = parseOptionalBoolean(payload.petFriendly);
  if (petFriendly !== undefined) product.petFriendly = petFriendly;
  const potIncluded = parseOptionalBoolean(payload.potIncluded);
  if (potIncluded !== undefined) product.potIncluded = potIncluded;

  return product;
}

function includesOneOrAll(
  values: readonly string[] | undefined,
  candidate: string | undefined,
): boolean {
  if (!values || values.length === 0) return true;
  if (!candidate) return false;
  return values.includes(candidate);
}

function includesAnyNumber(
  values: readonly number[] | undefined,
  candidate: number,
): boolean {
  if (!values || values.length === 0) return true;
  return values.includes(candidate);
}

function variantMatches(
  product: Product,
  variant: ProductVariant,
  params: ProductListParams,
): boolean {
  const color = product.colors.find((entry) => entry.id === variant.colorId);
  if (params.colors && params.colors.length > 0) {
    const colorFamily = color?.family;
    if (!colorFamily || !params.colors.includes(colorFamily)) return false;
  }
  if (!includesOneOrAll(params.curtainHeaders, variant.curtainHeader))
    return false;
  if (!includesOneOrAll(params.mountings, variant.blindMountingType))
    return false;
  if (!includesOneOrAll(params.controlSides, variant.blindControlSide))
    return false;
  if (!includesOneOrAll(params.cushionContents, variant.cushionContent))
    return false;
  if (!includesOneOrAll(params.chairPadFastenings, variant.chairPadFastening))
    return false;
  if (!includesOneOrAll(params.accessoryFinishes, variant.accessoryFinish))
    return false;
  if (!includesAnyNumber(params.widths, variant.widthCm)) return false;
  if (!includesAnyNumber(params.heights, variant.heightCm)) return false;
  if (!includesOneOrAll(params.availability, variant.availability))
    return false;
  if (
    params.minPriceMinor != null &&
    variant.price.amountMinor < params.minPriceMinor
  )
    return false;
  if (
    params.maxPriceMinor != null &&
    variant.price.amountMinor > params.maxPriceMinor
  )
    return false;
  return true;
}

function variantDiscount(variant: ProductVariant): number {
  if (!variant.compareAtPrice) return 0;
  return Math.max(
    0,
    variant.compareAtPrice.amountMinor - variant.price.amountMinor,
  );
}

function productMatches(product: Product, params: ProductListParams): boolean {
  if (!includesOneOrAll(params.categories, product.category)) return false;
  if (!includesOneOrAll(params.materials, product.material)) return false;
  if (!includesOneOrAll(params.opacityLevels, product.opacityLevel))
    return false;
  if (!includesOneOrAll(params.patterns, product.pattern)) return false;
  if (!includesOneOrAll(params.blindTypes, product.blindType)) return false;
  if (!includesOneOrAll(params.accessoryTypes, product.accessoryType))
    return false;
  if (!includesOneOrAll(params.furnitureTypes, product.furnitureType))
    return false;
  if (!includesOneOrAll(params.furnitureStyles, product.furnitureStyle))
    return false;
  if (params.furnitureRooms != null && params.furnitureRooms.length > 0) {
    if (
      !(product.furnitureRooms ?? []).some((room) =>
        params.furnitureRooms?.includes(room),
      )
    ) {
      return false;
    }
  }
  if (!includesOneOrAll(params.plantNatures, product.plantNature)) return false;
  if (!includesOneOrAll(params.plantTypes, product.plantType)) return false;
  if (!includesOneOrAll(params.plantCareLevels, product.plantCareLevel))
    return false;
  if (!includesOneOrAll(params.plantLightNeeds, product.plantLightNeed))
    return false;
  if (params.shapes != null && params.shapes.length > 0) {
    const shape = product.cushionShape ?? product.chairPadShape;
    if (!shape || !params.shapes.includes(shape)) return false;
  }
  if (params.onlyThermal && !product.isThermal) return false;
  if (params.onlyLargeWidth && !product.isLargeWidth) return false;
  if (params.onlyNew && !product.isNew) return false;
  if (params.onlyBestSellers && !product.isBestSeller) return false;
  if (
    params.onlyDiscounted &&
    !product.variants.some((variant) => variantDiscount(variant) > 0)
  )
    return false;

  return product.variants.some((variant) =>
    variantMatches(product, variant, params),
  );
}

function scopeMatches(product: Product, scope?: CatalogScope): boolean {
  if (!scope) return true;
  if (!includesOneOrAll(scope.categories, product.category)) return false;
  if (!includesOneOrAll(scope.materials, product.material)) return false;
  if (!includesOneOrAll(scope.opacityLevels, product.opacityLevel))
    return false;
  if (!includesOneOrAll(scope.patterns, product.pattern)) return false;
  if (!includesOneOrAll(scope.blindTypes, product.blindType)) return false;
  if (!includesOneOrAll(scope.accessoryTypes, product.accessoryType))
    return false;
  if (!includesOneOrAll(scope.furnitureTypes, product.furnitureType))
    return false;
  if (!includesOneOrAll(scope.furnitureStyles, product.furnitureStyle))
    return false;
  if (scope.furnitureRooms && scope.furnitureRooms.length > 0) {
    const matches = (product.furnitureRooms ?? []).some((room) =>
      scope.furnitureRooms?.includes(room),
    );
    if (!matches) return false;
  }
  if (!includesOneOrAll(scope.plantNatures, product.plantNature)) return false;
  if (!includesOneOrAll(scope.plantTypes, product.plantType)) return false;
  if (
    !includesOneOrAll(
      scope.plantSizes,
      product.variants.find((variant) => variant.plantSize)?.plantSize,
    )
  )
    return false;
  if (scope.onlyThermal && !product.isThermal) return false;
  if (scope.onlyLargeWidth && !product.isLargeWidth) return false;
  if (scope.curtainHeaders && scope.curtainHeaders.length > 0) {
    const hasHeader = product.variants.some(
      (variant) =>
        variant.curtainHeader &&
        scope.curtainHeaders?.includes(variant.curtainHeader),
    );
    if (!hasHeader) return false;
  }
  return true;
}

function minVariantPrice(product: Product): number {
  return product.variants.reduce(
    (value, variant) => Math.min(value, variant.price.amountMinor),
    Number.POSITIVE_INFINITY,
  );
}

function maxVariantPrice(product: Product): number {
  return product.variants.reduce(
    (value, variant) => Math.max(value, variant.price.amountMinor),
    0,
  );
}

function maxDiscountForProduct(product: Product): number {
  if (product.variants.length === 0) return 0;
  return product.variants.reduce(
    (value, variant) => Math.max(value, variantDiscount(variant)),
    0,
  );
}

function sortProducts(items: readonly Product[], sort: ProductSort): Product[] {
  const ranked = [...items];
  ranked.sort((left, right) => {
    switch (sort) {
      case "newest":
        return right.createdAt.localeCompare(left.createdAt);
      case "best_sellers": {
        const leftScore =
          Number(left.isBestSeller) * 1_000_000 + left.recommendationScore;
        const rightScore =
          Number(right.isBestSeller) * 1_000_000 + right.recommendationScore;
        return rightScore - leftScore;
      }
      case "price_asc":
        return minVariantPrice(left) - minVariantPrice(right);
      case "price_desc":
        return maxVariantPrice(right) - maxVariantPrice(left);
      case "discount": {
        const leftDiscount = maxDiscountForProduct(left);
        const rightDiscount = maxDiscountForProduct(right);
        if (rightDiscount !== leftDiscount) return rightDiscount - leftDiscount;
        return right.recommendationScore - left.recommendationScore;
      }
      case "recommended":
      default:
        return right.recommendationScore - left.recommendationScore;
    }
  });
  return ranked;
}

function paginate(
  items: readonly Product[],
  page: number,
  pageSize: number,
): { items: Product[]; total: number; totalPages: number; page: number } {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, Math.min(200, pageSize));
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const currentPage = Math.min(safePage, totalPages);
  const offset = (currentPage - 1) * safePageSize;
  return {
    total,
    totalPages,
    page: currentPage,
    items: items.slice(offset, offset + safePageSize),
  };
}

function toScopeParams(scope?: CatalogScope): ProductListParams {
  return {
    page: 1,
    pageSize: 500,
    sort: "recommended",
    categories: uniqueList(scope?.categories),
    materials: uniqueList(scope?.materials),
    opacityLevels: uniqueList(scope?.opacityLevels),
    curtainHeaders: uniqueList(scope?.curtainHeaders),
    patterns: uniqueList(scope?.patterns),
    blindTypes: uniqueList(scope?.blindTypes),
    shapes: uniqueList(scope?.shapes),
    accessoryTypes: uniqueList(scope?.accessoryTypes),
    furnitureTypes: uniqueList(scope?.furnitureTypes),
    furnitureRooms: uniqueList(scope?.furnitureRooms),
    furnitureStyles: uniqueList(scope?.furnitureStyles),
    plantNatures: uniqueList(scope?.plantNatures),
    plantTypes: uniqueList(scope?.plantTypes),
    plantSizes: uniqueList(scope?.plantSizes),
    sellingMode: uniqueList(scope?.sellingMode),
    onlyThermal: scope?.onlyThermal,
    onlyLargeWidth: scope?.onlyLargeWidth,
  };
}

export class PostgresProductRepository implements ProductRepository {
  constructor(private readonly database: Kysely<DatabaseSchema>) {}

  async listProducts(input: ProductListParams): Promise<PaginatedProducts> {
    const params = normalizeListParams(input);
    const rows = await this.fetchRows(params);
    const products = rows
      .map((row) => parseProduct(row))
      .filter((product): product is Product => product !== null)
      .filter((product) => productMatches(product, params));
    const categoryCounts = params.query
      ? products.reduce<Record<string, number>>((counts, product) => {
          counts[product.category] = (counts[product.category] ?? 0) + 1;
          return counts;
        }, {})
      : undefined;
    const sorted =
      params.query && params.sort === "recommended"
        ? sortSearchProducts(products, params.query)
        : sortProducts(products, params.sort);
    const result = paginate(sorted, params.page, params.pageSize);

    return {
      items: result.items,
      page: result.page,
      pageSize: params.pageSize,
      total: result.total,
      totalPages: result.totalPages,
      ...(categoryCounts ? { categoryCounts } : {}),
    };
  }

  async getBySlug(slug: string): Promise<Product | null> {
    const normalized = asString(slug)?.trim();
    if (!normalized) return null;
    const rows = await this.database
      .selectFrom("catalog.products")
      .selectAll()
      .where("is_published", "=", true)
      .where("slug", "=", normalized)
      .limit(1)
      .execute();

    const row = rows[0];
    if (!row) return null;
    return parseProduct(row);
  }

  async getByIds(ids: readonly string[]): Promise<Product[]> {
    const requested = [
      ...new Set(
        ids
          .map((id) => asString(id))
          .filter((value): value is string => value != null),
      ),
    ];
    if (requested.length === 0) return [];
    const rows = await this.database
      .selectFrom("catalog.products")
      .selectAll()
      .where("is_published", "=", true)
      .where("id", "in", requested)
      .execute();

    const byId = new Map<string, Product>();
    for (const row of rows) {
      const product = parseProduct(row);
      if (product) byId.set(product.id, product);
    }

    const result: Product[] = [];
    for (const id of requested) {
      const product = byId.get(id);
      if (product) result.push(product);
    }
    return result;
  }

  async listRelated(slug: string, limit: number): Promise<Product[]> {
    const base = await this.getBySlug(slug);
    if (!base) return [];

    const params = normalizeListParams({
      page: 1,
      pageSize: Math.max(1, Math.min(12, Math.trunc(limit) || 4)),
      sort: "best_sellers",
      categories: [base.category],
      materials: undefined,
      colors: undefined,
      opacityLevels: undefined,
      curtainHeaders: undefined,
      patterns: undefined,
      blindTypes: undefined,
      shapes: undefined,
      cushionContents: undefined,
      chairPadFastenings: undefined,
      accessoryTypes: undefined,
      accessoryFinishes: undefined,
      mountings: undefined,
      controlSides: undefined,
      widths: undefined,
      heights: undefined,
      availability: undefined,
      sellingMode: undefined,
      onlyNew: false,
      onlyBestSellers: undefined,
      onlyDiscounted: undefined,
      onlyThermal: undefined,
      onlyLargeWidth: undefined,
      ids: undefined,
      plantCareLevels: undefined,
      plantLightNeeds: undefined,
      plantNatures: undefined,
      plantTypes: undefined,
      plantSizes: undefined,
      furnitureTypes: undefined,
      furnitureRooms: undefined,
      furnitureStyles: undefined,
    });
    const rows = await this.fetchRows(params);
    const candidates = rows
      .map((row) => parseProduct(row))
      .filter((product): product is Product => product !== null)
      .filter((product) => product.id !== base.id)
      .filter(
        (product) =>
          product.material === base.material ||
          product.pattern === base.pattern,
      );
    const sorted = sortProducts(candidates, "best_sellers");
    return sorted.slice(0, params.pageSize);
  }

  async listScope(scope?: CatalogScope): Promise<Product[]> {
    const params = toScopeParams(scope);
    const rows = await this.fetchRows(params);
    return rows
      .map((row) => parseProduct(row))
      .filter((product): product is Product => product !== null)
      .filter((product) => scopeMatches(product, scope))
      .sort(
        (left, right) => right.recommendationScore - left.recommendationScore,
      );
  }

  private async fetchRows(
    params: ProductListParams,
  ): Promise<CatalogProductRow[]> {
    let query = this.database
      .selectFrom("catalog.products")
      .selectAll()
      .where("is_published", "=", true);

    const search = params.query?.trim();
    if (search) {
      const contains = `%${search}%`;
      query = query.where(sql<boolean>`(
        to_tsvector(
          'simple'::regconfig,
          coalesce(name, '') || ' ' ||
          coalesce(reference, '') || ' ' ||
          coalesce(slug, '') || ' ' ||
          coalesce(category, '') || ' ' ||
          coalesce(material, '') || ' ' ||
          coalesce(short_description, '') || ' ' ||
          coalesce(long_description, '') || ' ' ||
          coalesce(product::text, '')
        ) @@ websearch_to_tsquery('simple'::regconfig, ${search})
        or lower(name) like lower(${contains})
        or lower(reference) like lower(${contains})
        or lower(slug) like lower(${contains})
        or exists (
          select 1
          from catalog.product_variants variant
          where variant.product_id = catalog.products.id
            and variant.status = 'active'
            and lower(variant.sku) like lower(${contains})
        )
        or exists (
          select 1
          from catalog.product_attributes attribute
          where attribute.product_id = catalog.products.id
            and lower(attribute.value::text) like lower(${contains})
        )
      )`);
    }

    if (params.categories?.length) {
      query = query.where("category", "in", [...params.categories]);
    }
    if (params.materials?.length) {
      query = query.where("material", "in", [...params.materials]);
    }
    if (params.opacityLevels?.length) {
      query = query.where("opacity_level", "in", [...params.opacityLevels]);
    }
    if (params.sellingMode?.length) {
      query = query.where("selling_mode", "in", [...params.sellingMode]);
    }
    if (params.onlyNew) query = query.where("is_new", "=", true);
    if (params.onlyBestSellers)
      query = query.where("is_best_seller", "=", true);
    if (params.onlyThermal) query = query.where("is_thermal", "=", true);
    if (params.onlyLargeWidth) query = query.where("is_large_width", "=", true);
    if (params.ids?.length) query = query.where("id", "in", [...params.ids]);
    if (params.patterns?.length) {
      query = query.where("pattern", "in", [...params.patterns]);
    }
    if (params.blindTypes?.length) {
      query = query.where("blind_type", "in", [...params.blindTypes]);
    }

    return await query.execute();
  }
}

function normalizeListParams(input: ProductListParams): ProductListParams {
  return {
    page: Math.max(1, Math.trunc(input.page || 1)),
    pageSize: Math.max(1, Math.min(200, Math.trunc(input.pageSize || 12))),
    sort: input.sort,
    query: normalizeSearchQuery(input.query),
    categories: uniqueList(input.categories),
    materials: uniqueList(input.materials),
    colors: uniqueList(input.colors),
    opacityLevels: uniqueList(input.opacityLevels),
    curtainHeaders: uniqueList(input.curtainHeaders),
    patterns: uniqueList(input.patterns),
    blindTypes: uniqueList(input.blindTypes),
    shapes: uniqueList(input.shapes),
    cushionContents: uniqueList(input.cushionContents),
    chairPadFastenings: uniqueList(input.chairPadFastenings),
    accessoryTypes: uniqueList(input.accessoryTypes),
    accessoryFinishes: uniqueList(input.accessoryFinishes),
    mountings: uniqueList(input.mountings),
    controlSides: uniqueList(input.controlSides),
    widths: input.widths,
    heights: input.heights,
    availability: uniqueList(input.availability),
    minPriceMinor: input.minPriceMinor,
    maxPriceMinor: input.maxPriceMinor,
    sellingMode: uniqueList(input.sellingMode),
    onlyNew: input.onlyNew,
    onlyBestSellers: input.onlyBestSellers,
    onlyDiscounted: input.onlyDiscounted,
    onlyThermal: input.onlyThermal,
    onlyLargeWidth: input.onlyLargeWidth,
    ids: uniqueList(input.ids),
    plantCareLevels: uniqueList(input.plantCareLevels),
    plantLightNeeds: uniqueList(input.plantLightNeeds),
    plantNatures: uniqueList(input.plantNatures),
    plantTypes: uniqueList(input.plantTypes),
    plantSizes: uniqueList(input.plantSizes),
    furnitureTypes: uniqueList(input.furnitureTypes),
    furnitureRooms: uniqueList(input.furnitureRooms),
    furnitureStyles: uniqueList(input.furnitureStyles),
  };
}

function normalizeSearchQuery(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, " ").slice(0, 120);
  if (!normalized) return undefined;
  return normalized;
}

function searchScore(product: Product, query: string): number {
  const normalized = query.toLocaleLowerCase("fr");
  const name = product.name.toLocaleLowerCase("fr");
  const reference = product.reference.toLocaleLowerCase("fr");
  const slug = product.slug.toLocaleLowerCase("fr");
  const tokens = normalized.split(/\s+/).filter(Boolean);
  let score = 0;
  if (reference.includes(normalized)) score += 140;
  if (name === normalized) score += 120;
  else if (name.startsWith(normalized)) score += 100;
  else if (name.includes(normalized)) score += 80;
  if (slug.includes(normalized)) score += 70;
  if (product.category.toLocaleLowerCase("fr").includes(normalized))
    score += 60;
  if (product.material.toLocaleLowerCase("fr").includes(normalized))
    score += 50;
  if (product.shortDescription.toLocaleLowerCase("fr").includes(normalized))
    score += 15;
  if (product.longDescription.toLocaleLowerCase("fr").includes(normalized))
    score += 10;
  if (
    product.variants.some((variant) =>
      variant.sku.toLocaleLowerCase("fr").includes(normalized),
    )
  )
    score += 135;
  if (
    tokens.length > 1 &&
    tokens.every((token) =>
      `${name} ${reference} ${slug} ${product.shortDescription}`.includes(
        token,
      ),
    )
  )
    score += 25;
  return score;
}

function sortSearchProducts(
  products: readonly Product[],
  query: string,
): Product[] {
  return [...products].sort((left, right) => {
    const scoreDifference =
      searchScore(right, query) - searchScore(left, query);
    if (scoreDifference !== 0) return scoreDifference;
    const recommendationDifference =
      right.recommendationScore - left.recommendationScore;
    if (recommendationDifference !== 0) return recommendationDifference;
    return right.createdAt.localeCompare(left.createdAt);
  });
}
