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

export function confectionOptionsFor(
  category: string,
): readonly ConfectionOption[] {
  return category === "rideaux" || category === "voilages"
    ? DEFAULT_CONFECTION_OPTIONS
    : [];
}

export function confectionOptionFor(
  category: string,
  key: string | null | undefined,
): ConfectionOption | undefined {
  if (!key) return undefined;
  return confectionOptionsFor(category).find((option) => option.key === key);
}
