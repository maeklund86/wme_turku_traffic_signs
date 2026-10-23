import type { TrafficSign } from "./traffic-sign";

/**
 * Stable Sign Categories keyed only by the Finnish sign-code prefixes.
 * Specific groups come first because they refine broader sign families.
 */
export const SIGN_CATEGORIES = [
  {
    key: "speed-limits",
    label: "Speed limits",
    prefixes: ["C32", "C33", "C34", "C35", "C36_7", "C36.7"],
  },
  { key: "priority", label: "Priority", prefixes: ["B"] },
  {
    key: "parking",
    label: "Parking",
    prefixes: ["C37", "C38", "C39", "C40", "C41", "C42", "C43", "C44", "E2", "E3", "E4", "F46"],
  },
  { key: "warning", label: "Warning signs", prefixes: ["A"] },
  { key: "restrictions", label: "Other restrictions", prefixes: ["C"] },
  { key: "mandatory", label: "Mandatory signs", prefixes: ["D"] },
  { key: "rules", label: "Traffic rules", prefixes: ["E"] },
  { key: "directions", label: "Direction signs", prefixes: ["F"] },
  { key: "services", label: "Service signs", prefixes: ["G"] },
  { key: "supplementary", label: "Supplementary signs", prefixes: ["H"] },
  { key: "other", label: "Other", prefixes: [] },
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
  return signs.filter((sign) => selected.has(categoryForCode(sign.signCode)));
}

function categoryForCode(signCode: string): SignCategoryKey {
  return (
    SIGN_CATEGORIES.find(({ prefixes }) => prefixes.some((prefix) => signCode.startsWith(prefix)))
      ?.key ?? "other"
  );
}
