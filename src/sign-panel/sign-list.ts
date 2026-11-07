import {
  SIGN_LIST_CLASS,
  SIGN_LIST_HEADER_CLASS,
  SIGN_ROW_BODY_CLASS,
  SIGN_ROW_CATEGORY_CLASS,
  SIGN_ROW_CLASS,
  SIGN_ROW_CODE_CLASS,
  SIGN_ROW_DISCLOSURE_CLASS,
  SIGN_ROW_ICON_CLASS,
  SIGN_ROW_NAME_CLASS,
  SIGN_ROW_NOTES_FULL_CLASS,
  SIGN_ROW_SELECTED_CLASS,
} from "../constants";
import type { TrafficSign } from "../data/traffic-sign";
import { categoryForCode } from "../data/sign-categories";
import { resolveSignMarkerGraphic } from "../visual-overlay/marker-style";

/**
 * The Sign Panel's viewport-driven list (spec §4.5, AC-20/AC-21): a count
 * header over one self-contained row per sign inside the viewport. It only ever
 * renders the signs it is handed — the viewport query against the in-memory
 * spatial index stays in the tab, which is where the viewport comes from.
 */
export interface SignList {
  /** Replaces the rows with exactly these signs, in the order given. */
  render(signs: readonly TrafficSign[]): void;
  /** Highlights one row, or clears the current selection. */
  select(sign: TrafficSign | null): void;
  /** Clears stale rows and removes the count claim when viewport bounds fail. */
  markUnavailable(): void;
}

interface SignRow {
  sign: TrafficSign;
  item: HTMLElement;
  setSelected(selected: boolean): void;
  setNotesExpanded(expanded: boolean): void;
}

/** Creates the list's header and rows inside the tab pane. */
export function openSignList(
  document: Document,
  pane: HTMLElement,
  onRowActivate: (sign: TrafficSign) => void,
): SignList {
  const header = document.createElement("div");
  header.className = SIGN_LIST_HEADER_CLASS;

  const list = document.createElement("ul");
  list.className = SIGN_LIST_CLASS;

  pane.append(header, list);
  let signs: readonly TrafficSign[] = [];
  let rows: SignRow[] = [];
  let selectedSign: TrafficSign | null = null;
  let expandedSign: TrafficSign | null = null;
  return { render, select, markUnavailable };

  function render(nextSigns: readonly TrafficSign[]): void {
    // Whole-list replacement, not patching: the viewport decides membership,
    // so every move recalculates membership. Rows remain in fetch order, which
    // keeps the list stable across moves.
    if (selectedSign !== null && !nextSigns.includes(selectedSign)) {
      selectedSign = null;
      expandedSign = null;
    }
    signs = nextSigns;
    header.textContent = countText(nextSigns.length);
    rows = nextSigns.map((sign) => buildRow(document, sign, activate));
    updateRows();
    list.replaceChildren(...rows.map((row) => row.item));
  }

  function select(sign: TrafficSign | null): void {
    selectedSign = sign !== null && signs.includes(sign) ? sign : null;
    expandedSign = selectedSign?.notes === null || selectedSign === null ? null : selectedSign;
    updateRows();
    if (selectedSign !== null) {
      rows.find((row) => row.sign === selectedSign)?.item.scrollIntoView?.();
    }
  }

  function markUnavailable(): void {
    // Never keep displaying a count from a previous viewport when current
    // bounds cannot be read; that would claim a stale count as current.
    header.textContent = "Sign count unavailable";
    list.replaceChildren();
    signs = [];
    rows = [];
    selectedSign = null;
    expandedSign = null;
  }

  function activate(sign: TrafficSign): void {
    const wasSelected = selectedSign === sign;
    selectedSign = sign;
    expandedSign = sign.notes === null ? null : wasSelected && expandedSign === sign ? null : sign;
    updateRows();
    onRowActivate(sign);
  }

  function updateRows(): void {
    for (const row of rows) {
      row.setSelected(row.sign === selectedSign);
      row.setNotesExpanded(row.sign === expandedSign);
    }
  }
}

/** The header is the count: the user reads how many signs the view holds. */
function countText(count: number): string {
  return count === 1 ? "1 sign in view" : `${count} signs in view`;
}

function buildRow(
  document: Document,
  sign: TrafficSign,
  onActivate: (sign: TrafficSign) => void,
): SignRow {
  const item = document.createElement("li");

  const row = document.createElement("button");
  row.type = "button";
  row.className = SIGN_ROW_CLASS;
  row.setAttribute("aria-expanded", "false");
  row.setAttribute("aria-pressed", "false");

  const icon = document.createElement("img");
  icon.className = SIGN_ROW_ICON_CLASS;
  // The same graphic the marker draws — the official CC0 SVG, or the code
  // plate when the pinned collection has none — resolved at the one place
  // that decides it, so list and map can never disagree (AC-11, AC-21).
  // Decorative next to the code, hence an empty alt.
  icon.src = resolveSignMarkerGraphic(sign.signCode).graphic;
  icon.alt = "";

  const code = document.createElement("span");
  code.className = SIGN_ROW_CODE_CLASS;
  code.textContent = sign.signCode;

  const body = document.createElement("span");
  body.className = SIGN_ROW_BODY_CLASS;
  const name = document.createElement("span");
  name.className = SIGN_ROW_NAME_CLASS;
  // Registry values verbatim: Finnish names and notes are never translated (AC-24).
  name.textContent = sign.signName;
  const category = document.createElement("span");
  category.className = SIGN_ROW_CATEGORY_CLASS;
  category.textContent = categoryForCode(sign.signCode).label;
  body.append(name, category);

  row.append(icon, code, body);

  // A sign without a registry note (`Huomautus` null) has no notes at all:
  // nothing is rendered and the row cannot expand into an empty block (AC-21).
  const notes = sign.notes;
  const notesDisclosure = notes === null ? null : buildNotesDisclosure(document, notes);
  let disclosureIndicator: HTMLElement | null = null;
  if (notesDisclosure !== null) {
    disclosureIndicator = document.createElement("span");
    disclosureIndicator.className = SIGN_ROW_DISCLOSURE_CLASS;
    disclosureIndicator.textContent = "▸";
    disclosureIndicator.setAttribute("aria-hidden", "true");
    row.append(disclosureIndicator);
  }

  row.addEventListener("click", () => onActivate(sign));

  item.append(row);
  // Keep the row in place; expansion adds the full note beneath it.
  if (notesDisclosure !== null) item.append(notesDisclosure.full);
  return {
    sign,
    item,
    setSelected(selected: boolean): void {
      row.classList.toggle(SIGN_ROW_SELECTED_CLASS, selected);
      row.setAttribute("aria-pressed", String(selected));
    },
    setNotesExpanded(expanded: boolean): void {
      if (notesDisclosure === null) return;
      row.setAttribute("aria-expanded", String(expanded));
      notesDisclosure.full.hidden = !expanded;
      if (disclosureIndicator !== null) {
        disclosureIndicator.textContent = expanded ? "▾" : "▸";
      }
    },
  };
}

interface NotesDisclosure {
  full: HTMLElement;
}

function buildNotesDisclosure(document: Document, notes: string): NotesDisclosure {
  const full = document.createElement("div");
  full.className = SIGN_ROW_NOTES_FULL_CLASS;
  full.textContent = notes;
  full.hidden = true;

  return { full };
}
