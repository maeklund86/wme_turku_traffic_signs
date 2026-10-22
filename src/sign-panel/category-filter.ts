import {
  SIGN_CATEGORY_CHIP_CLASS,
  SIGN_CATEGORY_CHIPS_CLASS,
  SIGN_CATEGORY_FILTER_ACTIONS_CLASS,
  SIGN_CATEGORY_FILTER_ACTION_CLASS,
  SIGN_CATEGORY_FILTER_CLASS,
} from "../constants";
import { SIGN_CATEGORIES, type SignCategoryKey } from "../data/sign-categories";

export interface SignCategoryFilter {
  /** The collapsible block placed at the top of the Sign Panel. */
  element: HTMLDetailsElement;
  /** Applies persisted selection without emitting a change. */
  setSelected(categoryFilter: readonly SignCategoryKey[] | null): void;
}

/** Builds accessible category chips and select-all/none controls. */
export function openSignCategoryFilter(
  document: Document,
  onChange: (categoryFilter: readonly SignCategoryKey[] | null) => void,
): SignCategoryFilter {
  const details = document.createElement("details");
  details.className = SIGN_CATEGORY_FILTER_CLASS;
  details.open = true;

  const summary = document.createElement("summary");
  summary.textContent = "Sign Categories";

  const actions = document.createElement("div");
  actions.className = SIGN_CATEGORY_FILTER_ACTIONS_CLASS;

  const chips = document.createElement("div");
  chips.className = SIGN_CATEGORY_CHIPS_CLASS;

  const selected = new Set<SignCategoryKey>(SIGN_CATEGORIES.map(({ key }) => key));
  const chipButtons = new Map<SignCategoryKey, HTMLButtonElement>();

  const selectAll = actionButton(document, "Select all");
  selectAll.addEventListener("click", () => setSelectedAndNotify(null));
  const selectNone = actionButton(document, "Select none");
  selectNone.addEventListener("click", () => setSelectedAndNotify([]));
  actions.append(selectAll, selectNone);

  for (const category of SIGN_CATEGORIES) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = SIGN_CATEGORY_CHIP_CLASS;
    chip.textContent = category.label;
    chip.setAttribute("aria-pressed", "true");
    chip.addEventListener("click", () => {
      if (selected.has(category.key)) selected.delete(category.key);
      else selected.add(category.key);
      renderSelection();
      onChange(selectedFilter());
    });
    chipButtons.set(category.key, chip);
    chips.append(chip);
  }

  details.append(summary, actions, chips);
  renderSelection();

  return { element: details, setSelected };

  function setSelected(categoryFilter: readonly SignCategoryKey[] | null): void {
    selected.clear();
    for (const category of SIGN_CATEGORIES) {
      if (categoryFilter === null || categoryFilter.includes(category.key)) {
        selected.add(category.key);
      }
    }
    renderSelection();
  }

  function setSelectedAndNotify(categoryFilter: readonly SignCategoryKey[] | null): void {
    setSelected(categoryFilter);
    onChange(selectedFilter());
  }

  function selectedFilter(): readonly SignCategoryKey[] | null {
    if (selected.size === SIGN_CATEGORIES.length) return null;
    return SIGN_CATEGORIES.filter(({ key }) => selected.has(key)).map(({ key }) => key);
  }

  function renderSelection(): void {
    for (const [key, chip] of chipButtons) {
      chip.setAttribute("aria-pressed", String(selected.has(key)));
    }
  }
}

function actionButton(document: Document, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = SIGN_CATEGORY_FILTER_ACTION_CLASS;
  button.textContent = label;
  return button;
}
