export type ConfectionKey =
  "oeillets_argent" | "oeillets_dore" | "galon_fronceur" | "wave";

export interface ConfectionOption {
  key: ConfectionKey;
  label: string;
  description: string;
}

export const DEFAULT_CONFECTION_OPTIONS: readonly ConfectionOption[] = [
  {
    key: "oeillets_argent",
    label: "Œillets argentés",
    description: "Anneaux métalliques argentés, à glisser sur une tringle.",
  },
  {
    key: "oeillets_dore",
    label: "Œillets dorés",
    description: "Anneaux métalliques dorés, à glisser sur une tringle.",
  },
  {
    key: "galon_fronceur",
    label: "Galon fronceur",
    description: "Ruban à froncer pour obtenir des plis souples et réguliers.",
  },
  {
    key: "wave",
    label: "Wave — rail coulissant",
    description: "Finition Wave adaptée à un rail coulissant au plafond.",
  },
];

function normalizeCategoryToken(category: string): string {
  return category
    .trim()
    .toLocaleLowerCase()
    .replace(/&/g, "et")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

export function isCurtainCategory(category: string): boolean {
  return [
    "rideaux",
    "voilages",
    "rideaux-voilages",
    "rideaux-et-voilages",
  ].includes(normalizeCategoryToken(category));
}

export function confectionOptionsFor(
  category: string,
): readonly ConfectionOption[] {
  return isCurtainCategory(category) ? DEFAULT_CONFECTION_OPTIONS : [];
}

export function confectionOptionFor(
  category: string,
  key: string | null | undefined,
): ConfectionOption | undefined {
  if (!key) return undefined;
  return confectionOptionsFor(category).find((option) => option.key === key);
}
