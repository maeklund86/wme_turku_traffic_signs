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
import { sameTrafficSign, type TrafficSign } from "../data/traffic-sign";
import { categoryForCode } from "../data/sign-categories";
import type { SignSelection } from "../sign-selection";
import { resolveSignMarkerGraphic } from "../visual-overlay/marker-style";

/**
 * The Sign Panel's viewport-driven list (spec §4.5, AC-20/AC-21): a count
 * header over one self-contained row per sign inside the viewport. It only ever
 * renders the signs it is handed — the viewport query against the in-memory
 * spatial index stays in the tab, which is where the viewport comes from.
 *
 * Selection belongs to the shared Sign Selection module: the list reads it to
 * mark and expand rows, and reports row clicks back to it.
 */
export interface SignList {
  /** Replaces the rows with exactly these signs, in the order given. */
  render(signs: readonly TrafficSign[]): void;
  /** Clears stale rows and removes the count claim when viewport bounds fail. */
  markUnavailable(): void;
  /** Stops following the shared selection after WME replaces the pane. */
  close(): void;
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
  selection: SignSelection,
  onRowActivate: (sign: TrafficSign) => void,
): SignList {
  const header = document.createElement("div");
  header.className = SIGN_LIST_HEADER_CLASS;

  const list = document.createElement("ul");
  list.className = SIGN_LIST_CLASS;

  pane.append(header, list);
  let signs: readonly TrafficSign[] = [];
  let rows: SignRow[] = [];
  let temporaryRow: SignRow | null = null;

  const stopFollowingSelection = selection.subscribe((change) => {
    syncTemporaryRow();
    updateRows();
    renderRows();
    // The Visual Overlay can select a marker just beyond the strict list
    // bounds. Reveal its temporary row, as list selection always has.
    if (change.source === "marker" && change.sign !== null) {
      const row = rowFor(change.sign);
      if (row?.item.isConnected) row.item.scrollIntoView?.();
    }
  });

  return { render, markUnavailable, close: stopFollowingSelection };

  function render(nextSigns: readonly TrafficSign[]): void {
    // Whole-list replacement, not patching: the viewport decides membership,
    // so every move recalculates membership. Rows remain in fetch order, which
    // keeps the list stable across moves.
    signs = nextSigns;
    header.textContent = countText(nextSigns.length);
    rows = nextSigns.map((sign) => buildRow(document, sign, activate));
    syncTemporaryRow();
    updateRows();
    renderRows();
  }

  function markUnavailable(): void {
    // Never keep displaying a count from a previous viewport when current
    // bounds cannot be read; that would claim a stale count as current.
    header.textContent = "Sign count unavailable";
    list.replaceChildren();
    signs = [];
    rows = [];
    temporaryRow = null;
  }

  function activate(sign: TrafficSign): void {
    const currentSign = selection.current().sign;
    if (currentSign !== null && sameTrafficSign(currentSign, sign)) {
      selection.toggleDetails();
    } else {
      selection.select(sign, "panel");
    }
    onRowActivate(sign);
  }

  /**
   * Keeps the selected Traffic Sign visible when the strict viewport excludes
   * it but the Visual Overlay's padded query still draws its marker.
   */
  function syncTemporaryRow(): void {
    const selectedSign = selection.current().sign;
    if (selectedSign === null || signs.some((sign) => sameTrafficSign(sign, selectedSign))) {
      temporaryRow = null;
      return;
    }
    if (temporaryRow === null || !sameTrafficSign(temporaryRow.sign, selectedSign)) {
      temporaryRow = buildRow(document, selectedSign, activate);
    }
  }

  function updateRows(): void {
    const { sign: selectedSign, detailsOpen } = selection.current();
    for (const row of allRows()) {
      const selected = selectedSign !== null && sameTrafficSign(row.sign, selectedSign);
      row.setSelected(selected);
      row.setNotesExpanded(selected && detailsOpen);
    }
  }

  function rowFor(sign: TrafficSign): SignRow | undefined {
    return (
      rows.find((row) => sameTrafficSign(row.sign, sign)) ??
      (temporaryRow !== null && sameTrafficSign(temporaryRow.sign, sign) ? temporaryRow : undefined)
    );
  }

  function allRows(): SignRow[] {
    return temporaryRow === null ? rows : [...rows, temporaryRow];
  }

  function renderRows(): void {
    list.replaceChildren(...allRows().map((row) => row.item));
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
