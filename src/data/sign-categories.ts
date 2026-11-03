import type { TrafficSign } from "./traffic-sign";

interface SignSubcategoryDefinition {
  readonly key: string;
  readonly label: string;
  /** Code families assigned to this child; an Unclassified child is the fallback. */
  readonly codePrefixes: readonly string[];
  readonly unclassified?: boolean;
}

interface SignCategoryDefinition {
  readonly key: string;
  readonly label: string;
  readonly displayCode: string | null;
  readonly prefixes: readonly string[];
  readonly subcategories?: readonly SignSubcategoryDefinition[];
}

const OTHER_SIGN_CATEGORY = {
  key: "other",
  label: "Other",
  displayCode: null,
  prefixes: [],
} as const;

/** Stable Sign Categories keyed only by the Finnish sign-code prefixes. */
export const SIGN_CATEGORIES = [
  {
    key: "speed-limits",
    label: "Speed limits",
    displayCode: "C32–36.7",
    prefixes: ["C32", "C33", "C34", "C35", "C36_7", "C36.7"],
    subcategories: [
      {
        key: "speed-limits-general",
        label: "General speed limits",
        codePrefixes: codeRange("C", 32, 33),
      },
      {
        key: "speed-limits-areas",
        label: "Speed-limit areas",
        codePrefixes: codeRange("C", 34, 35),
      },
      {
        key: "speed-limits-time-lane",
        label: "Time- or lane-specific limits",
        codePrefixes: ["C36.7", "C36_7"],
      },
      {
        key: "speed-limits-unclassified",
        label: "Unclassified",
        codePrefixes: [],
        unclassified: true,
      },
    ],
  },
  { key: "priority", label: "Priority", displayCode: "B", prefixes: ["B"] },
  {
    key: "parking",
    label: "Parking",
    displayCode: "C37–44, E2–4, F46",
    prefixes: ["C37", "C38", "C39", "C40", "C41", "C42", "C43", "C44", "E2", "E3", "E4", "F46"],
  },
  {
    key: "warning",
    label: "Warning signs",
    displayCode: "A",
    prefixes: ["A"],
    subcategories: [
      {
        key: "warning-road-layout",
        label: "Road layout and condition",
        codePrefixes: codeRange("A", 1, 14),
      },
      {
        key: "warning-people-animals-recreation",
        label: "Pedestrians, cyclists, animals, and recreation",
        codePrefixes: codeRange("A", 15, 20),
      },
      {
        key: "warning-intersections-rail-crossings",
        label: "Intersections and rail crossings",
        codePrefixes: codeRange("A", 21, 29),
      },
      {
        key: "warning-other-hazards",
        label: "Other hazards",
        codePrefixes: codeRange("A", 30, 33),
      },
      {
        key: "warning-unclassified",
        label: "Unclassified",
        codePrefixes: [],
        unclassified: true,
      },
    ],
  },
  {
    key: "restrictions",
    label: "Other restrictions",
    displayCode: "C",
    prefixes: ["C"],
  },
  { key: "mandatory", label: "Mandatory signs", displayCode: "D", prefixes: ["D"] },
  { key: "rules", label: "Traffic rules", displayCode: "E", prefixes: ["E"] },
  { key: "directions", label: "Direction signs", displayCode: "F", prefixes: ["F"] },
  { key: "services", label: "Service signs", displayCode: "G", prefixes: ["G"] },
  { key: "supplementary", label: "Supplementary signs", displayCode: "H", prefixes: ["H"] },
  OTHER_SIGN_CATEGORY,
] as const satisfies readonly SignCategoryDefinition[];

type Category = (typeof SIGN_CATEGORIES)[number];
type SubdividedCategory = Extract<Category, { readonly subcategories: readonly unknown[] }>;
type ParentCategoryKey = SubdividedCategory["key"];
type DirectCategoryKey = Exclude<Category["key"], ParentCategoryKey>;

export type SignCategoryKey = Category["key"];
export type SignSubcategoryKey = SubdividedCategory["subcategories"][number]["key"];
/** Selectable terminal nodes: child keys for subdivided categories, category keys otherwise. */
export type SignFilterKey = DirectCategoryKey | SignSubcategoryKey;

const selectableKeys: SignFilterKey[] = [];
for (const category of SIGN_CATEGORIES) {
  if ("subcategories" in category) {
    for (const subcategory of category.subcategories) selectableKeys.push(subcategory.key);
  } else {
    selectableKeys.push(category.key as DirectCategoryKey);
  }
}
export const SIGN_FILTER_KEYS: readonly SignFilterKey[] = selectableKeys;

export function isSignCategoryKey(value: unknown): value is SignCategoryKey {
  return SIGN_CATEGORIES.some(({ key }) => key === value);
}

export function isSignFilterKey(value: unknown): value is SignFilterKey {
  return SIGN_FILTER_KEYS.some((key) => key === value);
}

/** Expands an old category-only choice to all current children, if it has any. */
export function filterKeysForCategory(categoryKey: SignCategoryKey): readonly SignFilterKey[] {
  const category = SIGN_CATEGORIES.find(({ key }) => key === categoryKey);
  if (category === undefined) return [];
  if ("subcategories" in category) return category.subcategories.map(({ key }) => key);
  return [category.key as DirectCategoryKey];
}

/** Filters signs by their terminal tree selection; null means all categories. */
export function filterSignsBySelection(
  signs: readonly TrafficSign[],
  filter: readonly SignFilterKey[] | null,
): readonly TrafficSign[] {
  if (filter === null) return signs;
  const selected = new Set(filter);
  return signs.filter((sign) => selected.has(filterKeyForCode(sign.signCode)));
}

/** The leaf that owns a code; unlisted codes in a subdivided category use its fallback child. */
export function filterKeyForCode(signCode: string): SignFilterKey {
  const category = categoryForCode(signCode);
  if (!("subcategories" in category)) return category.key as DirectCategoryKey;

  const subcategory = category.subcategories.find(({ codePrefixes }) =>
    codePrefixes.some((prefix) => matchesCodeFamily(signCode, prefix)),
  );
  if (subcategory !== undefined) return subcategory.key;

  const unclassified = category.subcategories.find(
    (subcategory) => "unclassified" in subcategory && subcategory.unclassified,
  );
  if (unclassified === undefined) {
    throw new Error(`Subdivided Sign Category "${category.key}" has no Unclassified child.`);
  }
  return unclassified.key;
}

export function categoryForCode(signCode: string): Category {
  return (
    SIGN_CATEGORIES.find(({ prefixes }) =>
      prefixes.some((prefix) => signCode.startsWith(prefix)),
    ) ?? OTHER_SIGN_CATEGORY
  );
}

/** A variant belongs to its family only at a code boundary, not by raw prefix. */
function matchesCodeFamily(signCode: string, family: string): boolean {
  return (
    signCode === family ||
    signCode.startsWith(`${family}.`) ||
    signCode.startsWith(`${family}_`) ||
    signCode.startsWith(`${family}-`)
  );
}

function codeRange(prefix: string, first: number, last: number): readonly string[] {
  return Array.from({ length: last - first + 1 }, (_, index) => `${prefix}${first + index}`);
}
