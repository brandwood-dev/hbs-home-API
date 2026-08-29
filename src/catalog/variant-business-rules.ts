/**
 * Business rules shared by the Admin catalogue write path.
 *
 * The public API accepts variant options as JSON because the available axes
 * are category-driven. Keep the validation here deliberately defensive: an
 * API caller must not be able to bypass the constraints enforced by the
 * Admin form by sending a different JSON shape.
 */

export interface VariantBusinessRuleViolation {
  code: string;
  title: string;
  detail: string;
  field: "dimensions" | "length";
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asToken(value: unknown): string {
  return typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[-\s]+/g, "_")
    : "";
}

function firstValue(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
}

/** Return the first applicable violation, or null when the options are valid. */
export function validateVariantBusinessRules(
  category: unknown,
  material: unknown,
  productPayload: unknown,
  options: unknown,
): VariantBusinessRuleViolation | null {
  const normalizedCategory = asToken(category);
  const normalizedMaterial = asToken(material);
  const payload = asRecord(productPayload);
  const attributes = asRecord(payload.attributes);
  const variant = asRecord(options);

  const width = asNumber(
    firstValue(variant.widthCm, variant.width_cm, variant.width),
  );
  const height = asNumber(
    firstValue(variant.heightCm, variant.height_cm, variant.height),
  );

  if ((width !== null && width < 0) || (height !== null && height < 0)) {
    return {
      code: "VARIANT_DIMENSION_INVALID",
      title: "Invalid variant dimensions",
      detail: "Variant dimensions cannot be negative.",
      field: "dimensions",
    };
  }
  if (height !== null && height > 315) {
    return {
      code: "VARIANT_HEIGHT_LIMIT",
      title: "Variant height is too large",
      detail: "The maximum supported curtain height is 315 cm (3.15 m).",
      field: "dimensions",
    };
  }
  if (
    (normalizedCategory === "rideaux" || normalizedCategory === "voilages") &&
    (normalizedMaterial.includes("velour") ||
      normalizedMaterial.includes("velours")) &&
    width !== null &&
    width > 0 &&
    width % 150 !== 0
  ) {
    return {
      code: "VELVET_WIDTH_INVALID",
      title: "Invalid velvet width",
      detail: "Velvet curtain widths must be multiples of 150 cm (one panel).",
      field: "dimensions",
    };
  }

  if (normalizedCategory === "accessoires") {
    const accessoryType = asToken(
      firstValue(
        variant.accessory_type,
        variant.accessoryType,
        variant.accessory_type_slug,
        attributes.accessory_type,
        attributes.accessoryType,
        payload.accessory_type,
        payload.accessoryType,
      ),
    );
    const length = asNumber(
      firstValue(variant.length, variant.lengthCm, variant.length_cm),
    );
    if (
      accessoryType === "tringle_extensible" &&
      length !== null &&
      (length < 150 || length > 300)
    ) {
      return {
        code: "EXTENSIBLE_ROD_LENGTH_INVALID",
        title: "Invalid extensible rod length",
        detail: "An extensible rod must measure between 150 and 300 cm.",
        field: "length",
      };
    }
  }

  return null;
}
