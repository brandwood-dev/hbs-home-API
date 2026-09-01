import type { Product, ProductVariant } from "./product-repository.js";

export interface VariantDisplayOption {
  label: string;
  value: string;
}

function displayValue(value: string): string {
  const normalized = value.replace(/_/g, " ").trim();
  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : normalized;
}

function addOption(
  options: VariantDisplayOption[],
  label: string,
  value: string | number | undefined,
): void {
  if (value === undefined) return;
  const normalized = typeof value === "number" ? String(value) : value.trim();
  if (!normalized) return;
  options.push({ label, value: displayValue(normalized) });
}

/**
 * Normalise les choix d'une variante pour tous les parcours clients.
 * Les libellés sont dérivés côté serveur afin que le panier et la commande
 * restent exacts même si le catalogue vivant est modifié après l'achat.
 */
export function getVariantDisplayOptions(
  product: Product,
  variant: ProductVariant,
): VariantDisplayOption[] {
  const options: VariantDisplayOption[] = [];
  const color = product.colors.find((entry) => entry.id === variant.colorId);
  addOption(options, "Coloris", color?.name);

  const dimensions =
    variant.sizeLabel?.trim() ??
    (variant.widthCm > 0 && variant.heightCm > 0
      ? `${String(variant.widthCm)} × ${String(variant.heightCm)} cm`
      : "");
  addOption(options, "Dimensions", dimensions);

  addOption(options, "Type de tête", variant.curtainHeader);
  addOption(options, "Œillets", variant.eyeletColor);
  addOption(options, "Doublure", variant.lining);
  addOption(options, "Contenu", variant.cushionContent);
  addOption(options, "Fermeture", variant.cushionClosure);
  addOption(options, "Fixation", variant.chairPadFastening);
  addOption(options, "Finition", variant.accessoryFinish);
  addOption(options, "Pose", variant.accessoryMountingType);
  addOption(options, "Pose", variant.blindMountingType);
  addOption(options, "Manœuvre", variant.blindControlSide);
  addOption(options, "Mécanisme", variant.blindMechanismColor);

  if (variant.minLengthCm !== undefined || variant.maxLengthCm !== undefined) {
    const min = variant.minLengthCm ?? variant.maxLengthCm;
    const max = variant.maxLengthCm ?? variant.minLengthCm;
    if (min !== undefined && max !== undefined) {
      addOption(options, "Longueur", `${String(min)} – ${String(max)} cm`);
    }
  }
  if (variant.diameterMm !== undefined)
    addOption(options, "Diamètre", `${String(variant.diameterMm)} mm`);
  if (variant.depthCm !== undefined)
    addOption(options, "Profondeur", `${String(variant.depthCm)} cm`);
  if (variant.seatCount !== undefined)
    addOption(options, "Assises", variant.seatCount);
  if (variant.plantHeightCm !== undefined)
    addOption(options, "Hauteur", `${String(variant.plantHeightCm)} cm`);
  if (variant.potDiameterCm !== undefined)
    addOption(
      options,
      "Diamètre du pot",
      `${String(variant.potDiameterCm)} cm`,
    );
  addOption(options, "Taille de plante", variant.plantSize);
  if (variant.packQuantity !== undefined)
    addOption(
      options,
      "Conditionnement",
      `Lot de ${String(variant.packQuantity)}`,
    );

  return options;
}
