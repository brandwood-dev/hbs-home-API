/**
 * Règle commerciale des panneaux pour les rideaux et voilages.
 * La largeur correspond à la largeur totale de la dimension choisie.
 */
export function panelCountOptionsFor(
  category: string,
  material: string,
  widthCm: number,
): readonly number[] {
  const normalizedCategory = category
    .trim()
    .toLocaleLowerCase()
    .replace(/[_\s]+/g, "-");
  if (normalizedCategory !== "rideaux" && normalizedCategory !== "voilages")
    return [];

  if (widthCm <= 150) return [1];
  if (material.trim().toLocaleLowerCase() === "velours" && widthCm === 450)
    return [1, 3];
  return [1, 2];
}

export function panelCountLabel(panelCount: number): string {
  return `${String(panelCount)} panneau${panelCount > 1 ? "x" : ""}`;
}
