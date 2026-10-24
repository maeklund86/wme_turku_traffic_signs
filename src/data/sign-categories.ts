import type { TrafficSign } from "./traffic-sign";

/**
 * Stable Sign Categories keyed only by the Finnish sign-code prefixes.
 * Specific groups come first because they refine broader sign families.
 */
const OTHER_SIGN_CATEGORY = {
  key: "other",
  label: "Other",
  displayCode: null,
  prefixes: [],
} as const;

export const SIGN_CATEGORIES = [
  {
    key: "speed-limits",
    label: "Speed limits",
    displayCode: "C32–36.7",
    prefixes: ["C32", "C33", "C34", "C35", "C36_7", "C36.7"],
  },
  { key: "priority", label: "Priority", displayCode: "B", prefixes: ["B"] },
  {
    key: "parking",
    label: "Parking",
    displayCode: "C37–44, E2–4, F46",
    prefixes: ["C37", "C38", "C39", "C40", "C41", "C42", "C43", "C44", "E2", "E3", "E4", "F46"],
  },
  { key: "warning", label: "Warning signs", displayCode: "A", prefixes: ["A"] },
  { key: "restrictions", label: "Other restrictions", displayCode: "C", prefixes: ["C"] },
  { key: "mandatory", label: "Mandatory signs", displayCode: "D", prefixes: ["D"] },
  { key: "rules", label: "Traffic rules", displayCode: "E", prefixes: ["E"] },
  { key: "directions", label: "Direction signs", displayCode: "F", prefixes: ["F"] },
  { key: "services", label: "Service signs", displayCode: "G", prefixes: ["G"] },
  { key: "supplementary", label: "Supplementary signs", displayCode: "H", prefixes: ["H"] },
  OTHER_SIGN_CATEGORY,
] as const;

export type SignCategoryKey = (typeof SIGN_CATEGORIES)[number]["key"];

export function isSignCategoryKey(value: unknown): value is SignCategoryKey {
  return SIGN_CATEGORIES.some(({ key }) => key === value);
}

/** Filters by `Varustelaji_koodi` prefix only; null means all categories. */
export function filterSignsByCategories(
  signs: readonly TrafficSign[],
  categoryFilter: readonly SignCategoryKey[] | null,
): readonly TrafficSign[] {
  if (categoryFilter === null) return signs;
  const selected = new Set(categoryFilter);
  return signs.filter((sign) => selected.has(categoryForCode(sign.signCode).key));
}

export function categoryForCode(signCode: string) {
  return (
    SIGN_CATEGORIES.find(({ prefixes }) =>
      prefixes.some((prefix) => signCode.startsWith(prefix)),
    ) ?? OTHER_SIGN_CATEGORY
  );
}
