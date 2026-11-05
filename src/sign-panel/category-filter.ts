import {
  SIGN_CATEGORY_CHECKBOX_CLASS,
  SIGN_CATEGORY_EXPAND_BUTTON_CLASS,
  SIGN_CATEGORY_FILTER_ACTIONS_CLASS,
  SIGN_CATEGORY_FILTER_ACTION_CLASS,
  SIGN_CATEGORY_FILTER_CLASS,
  SIGN_CATEGORY_LABEL_CLASS,
  SIGN_CATEGORY_LIST_CLASS,
  SIGN_CATEGORY_ROW_CLASS,
  SIGN_SUBCATEGORY_GROUP_CLASS,
  SIGN_SUBCATEGORY_LABEL_CLASS,
} from "../constants";
import {
  filterKeysForCategory,
  SIGN_CATEGORIES,
  SIGN_FILTER_KEYS,
  type SignFilterKey,
} from "../data/sign-categories";

export interface SignCategoryFilter {
  /** The collapsible block placed at the top of the Sign Panel. */
  element: HTMLDetailsElement;
  /** Applies persisted selection without emitting a change. */
  setSelected(filter: readonly SignFilterKey[] | null): void;
}

interface CategoryControl {
  checkbox: HTMLInputElement;
  keys: readonly SignFilterKey[];
  children: readonly { key: SignFilterKey; checkbox: HTMLInputElement }[];
}

/** Builds an accessible checkbox tree with whole-tree select-all/none controls. */
export function openSignCategoryFilter(
  document: Document,
  onChange: (filter: readonly SignFilterKey[] | null) => void,
): SignCategoryFilter {
  const details = document.createElement("details");
  details.className = SIGN_CATEGORY_FILTER_CLASS;
  details.open = true;

  const summary = document.createElement("summary");
  summary.textContent = "Sign Categories";

  const actions = document.createElement("div");
  actions.className = SIGN_CATEGORY_FILTER_ACTIONS_CLASS;

  const categories = document.createElement("div");
  categories.className = SIGN_CATEGORY_LIST_CLASS;

  const selected = new Set<SignFilterKey>(SIGN_FILTER_KEYS);
  const controls: CategoryControl[] = [];

  const selectAll = actionButton(document, "Select all");
  selectAll.addEventListener("click", () => setSelectedAndNotify(null));
  const selectNone = actionButton(document, "Select none");
  selectNone.addEventListener("click", () => setSelectedAndNotify([]));
  actions.append(selectAll, selectNone);

  for (const category of SIGN_CATEGORIES) {
    const row = document.createElement("div");
    row.className = SIGN_CATEGORY_ROW_CLASS;

    const label = document.createElement("label");
    label.className = SIGN_CATEGORY_LABEL_CLASS;
    const checkbox = filterCheckbox(document, category.label);
    label.append(checkbox);
    if (category.displayCode !== null) {
      const code = document.createElement("code");
      code.textContent = category.displayCode;
      label.append(code, document.createTextNode(" "));
    }
    label.append(document.createTextNode(category.label));
    row.append(label);

    const keys = filterKeysForCategory(category.key);
    const children: { key: SignFilterKey; checkbox: HTMLInputElement }[] = [];
    if ("subcategories" in category) {
      const groupId = `turku-signs-subcategories-${category.key}`;
      const group = document.createElement("div");
      group.id = groupId;
      group.className = SIGN_SUBCATEGORY_GROUP_CLASS;
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", `${category.label} subcategories`);
      group.hidden = true;

      for (const subcategory of category.subcategories) {
        const childLabel = document.createElement("label");
        childLabel.className = SIGN_SUBCATEGORY_LABEL_CLASS;
        const childCheckbox = filterCheckbox(document, subcategory.label);
        childLabel.append(childCheckbox, document.createTextNode(subcategory.label));
        group.append(childLabel);
        children.push({ key: subcategory.key, checkbox: childCheckbox });
        childCheckbox.addEventListener("change", () => {
          setKeySelected(subcategory.key, childCheckbox.checked);
          renderSelection();
          onChange(selectedFilter());
        });
      }

      const expand = document.createElement("button");
      expand.type = "button";
      expand.className = SIGN_CATEGORY_EXPAND_BUTTON_CLASS;
      expand.textContent = "▸";
      expand.setAttribute("aria-expanded", "false");
      expand.setAttribute("aria-controls", groupId);
      expand.setAttribute("aria-label", `Expand ${category.label} subcategories`);
      expand.title = `Expand ${category.label} subcategories`;
      expand.addEventListener("click", () => {
        const expanded = group.hidden;
        group.hidden = !expanded;
        expand.textContent = expanded ? "▾" : "▸";
        expand.setAttribute("aria-expanded", String(expanded));
        const action = expanded ? "Collapse" : "Expand";
        expand.setAttribute("aria-label", `${action} ${category.label} subcategories`);
        expand.title = `${action} ${category.label} subcategories`;
      });
      row.append(expand);
      categories.append(row, group);
    } else {
      categories.append(row);
    }

    checkbox.addEventListener("change", () => {
      for (const key of keys) setKeySelected(key, checkbox.checked);
      renderSelection();
      onChange(selectedFilter());
    });
    controls.push({ checkbox, keys, children });
  }

  details.append(summary, actions, categories);
  renderSelection();

  return { element: details, setSelected };

  function setSelected(filter: readonly SignFilterKey[] | null): void {
    selected.clear();
    for (const key of SIGN_FILTER_KEYS) {
      if (filter === null || filter.includes(key)) selected.add(key);
    }
    renderSelection();
  }

  function setSelectedAndNotify(filter: readonly SignFilterKey[] | null): void {
    setSelected(filter);
    onChange(selectedFilter());
  }

  function selectedFilter(): readonly SignFilterKey[] | null {
    if (selected.size === SIGN_FILTER_KEYS.length) return null;
    return SIGN_FILTER_KEYS.filter((key) => selected.has(key));
  }

  function setKeySelected(key: SignFilterKey, isSelected: boolean): void {
    if (isSelected) selected.add(key);
    else selected.delete(key);
  }

  function renderSelection(): void {
    for (const control of controls) {
      const selectedChildren = control.keys.filter((key) => selected.has(key)).length;
      control.checkbox.checked = selectedChildren === control.keys.length;
      control.checkbox.indeterminate =
        selectedChildren > 0 && selectedChildren < control.keys.length;
      for (const child of control.children) {
        child.checkbox.checked = selected.has(child.key);
      }
    }
  }
}

function filterCheckbox(document: Document, accessibleName: string): HTMLInputElement {
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = SIGN_CATEGORY_CHECKBOX_CLASS;
  checkbox.setAttribute("aria-label", accessibleName);
  return checkbox;
}

function actionButton(document: Document, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = SIGN_CATEGORY_FILTER_ACTION_CLASS;
  button.textContent = label;
  return button;
}
