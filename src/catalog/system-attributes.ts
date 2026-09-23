const CURTAIN_FAMILY_ATTRIBUTE_KEYS = [
  "material",
  "opacity",
  "rooms",
  "large_width",
  "care",
  "installation",
] as const;

const SYSTEM_ATTRIBUTE_KEYS_BY_ROOT_CATEGORY: Readonly<
  Record<string, readonly string[]>
> = {
  rideaux: CURTAIN_FAMILY_ATTRIBUTE_KEYS,
  voilages: CURTAIN_FAMILY_ATTRIBUTE_KEYS,
  "rideaux-voilages": CURTAIN_FAMILY_ATTRIBUTE_KEYS,
  "rideaux-et-voilages": CURTAIN_FAMILY_ATTRIBUTE_KEYS,
  stores: [
    "material",
    "opacity",
    "rooms",
    "care",
    "installation",
    "blind_type",
    "mechanism",
  ],
  coussins: [
    "material",
    "rooms",
    "shape",
    "removable_cover",
    "machine_washable",
    "filling",
    "closure",
  ],
  "galettes-de-chaise": [
    "material",
    "rooms",
    "shape",
    "removable_cover",
    "machine_washable",
    "fastening",
    "thickness_cm",
  ],
  galettes_de_chaise: [
    "material",
    "rooms",
    "shape",
    "removable_cover",
    "machine_washable",
    "fastening",
    "thickness_cm",
  ],
  accessoires: [
    "material",
    "installation",
    "accessory_type",
    "compatibilities",
    "finish",
    "min_length_cm",
    "max_length_cm",
    "diameter_mm",
  ],
  mobilier: [
    "rooms",
    "furniture_type",
    "removable_cover",
    "upholstery",
    "frame_material",
    "leg_material",
    "features",
    "seat_comfort",
    "number_of_seats",
    "assembly_level",
    "assembly_time",
    "shipping_profile",
    "free_shipping_eligible",
    "width_cm",
    "depth_cm",
    "height_cm",
    "seat_width_cm",
    "seat_depth_cm",
    "seat_height_cm",
    "back_height_cm",
    "armrest_height_cm",
    "weight_kg",
    "max_load_kg",
    "storage_volume_l",
    "package_count",
  ],
  "mobilier-interieur": [
    "rooms",
    "furniture_type",
    "removable_cover",
    "upholstery",
    "frame_material",
    "leg_material",
    "features",
    "seat_comfort",
    "number_of_seats",
    "assembly_level",
    "assembly_time",
    "shipping_profile",
    "free_shipping_eligible",
    "width_cm",
    "depth_cm",
    "height_cm",
    "seat_width_cm",
    "seat_depth_cm",
    "seat_height_cm",
    "back_height_cm",
    "armrest_height_cm",
    "weight_kg",
    "max_load_kg",
    "storage_volume_l",
    "package_count",
  ],
  plantes: [
    "rooms",
    "care",
    "shipping_profile",
    "plant_nature",
    "plant_type",
    "plant_size",
    "common_name",
    "botanical_name",
    "plant_family",
    "origin",
    "light_need",
    "watering",
    "pet_safe",
    "toxicity_note",
    "flowering",
    "trailing",
    "pot_included",
    "indoor_use",
    "preservation",
    "fragile",
  ],
  "plantes-decoration": [
    "rooms",
    "care",
    "shipping_profile",
    "plant_nature",
    "plant_type",
    "plant_size",
    "common_name",
    "botanical_name",
    "plant_family",
    "origin",
    "light_need",
    "watering",
    "pet_safe",
    "toxicity_note",
    "flowering",
    "trailing",
    "pot_included",
    "indoor_use",
    "preservation",
    "fragile",
  ],
};

function normalizedCategorySlug(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("fr")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function systemAttributeKeysForRootCategory(
  rootCategorySlug: string,
): readonly string[] {
  return (
    SYSTEM_ATTRIBUTE_KEYS_BY_ROOT_CATEGORY[
      normalizedCategorySlug(rootCategorySlug)
    ] ?? []
  );
}

const MANAGED_SYSTEM_ATTRIBUTE_KEYS = [
  ...new Set(Object.values(SYSTEM_ATTRIBUTE_KEYS_BY_ROOT_CATEGORY).flat()),
] as readonly string[];

export function managedSystemAttributeKeys(): readonly string[] {
  return MANAGED_SYSTEM_ATTRIBUTE_KEYS;
}

export function shouldIgnoreUnavailableAttributeValue(
  attributeKey: string,
  isSystem: boolean,
  valueType: string,
  value: unknown,
): boolean {
  // Admin checkbox fields are submitted as false when switched off. When the
  // legacy large-width field is not bound to this category, false represents
  // absence, not an attempt to set a category-incompatible value. Keep this
  // compatibility exception narrow so custom boolean attributes still fail
  // loudly when they are submitted for the wrong category.
  return (
    isSystem &&
    attributeKey === "large_width" &&
    valueType === "boolean" &&
    value === false
  );
}
