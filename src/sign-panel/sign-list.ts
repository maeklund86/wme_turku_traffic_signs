import {
  SIGN_LIST_CLASS,
  SIGN_LIST_HEADER_CLASS,
  SIGN_ROW_BODY_CLASS,
  SIGN_ROW_CLASS,
  SIGN_ROW_CODE_CLASS,
  SIGN_ROW_ICON_CLASS,
  SIGN_ROW_NAME_CLASS,
  SIGN_ROW_NOTES_CLASS,
  SIGN_ROW_NOTES_FULL_CLASS,
  SIGN_ROW_SELECTED_CLASS,
} from "../constants";
import type { TrafficSign } from "../data/traffic-sign";
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
  /** Highlights and expands one row, or clears the current selection. */
  select(sign: TrafficSign | null): void;
  /** Clears stale rows and removes the count claim when viewport bounds fail. */
  markUnavailable(): void;
}

interface SignRow {
  sign: TrafficSign;
  item: HTMLElement;
  setSelected(selected: boolean): void;
}

/** Creates the list's header and rows inside the tab pane. */
export function openSignList(document: Document, pane: HTMLElement): SignList {
  const header = document.createElement("div");
  header.className = SIGN_LIST_HEADER_CLASS;

  const list = document.createElement("ul");
  list.className = SIGN_LIST_CLASS;

  pane.append(header, list);
  let signs: readonly TrafficSign[] = [];
  let rows: SignRow[] = [];
  let selectedSign: TrafficSign | null = null;
  return { render, select, markUnavailable };

  function render(nextSigns: readonly TrafficSign[]): void {
    // Whole-list replacement, not patching: the viewport decides membership,
    // so every move recalculates membership. Rows remain in fetch order, which
    // keeps the list stable across moves.
    if (selectedSign !== null && !nextSigns.includes(selectedSign)) selectedSign = null;
    signs = nextSigns;
    header.textContent = countText(nextSigns.length);
    rows = nextSigns.map((sign) => buildRow(document, sign));
    for (const row of rows) row.setSelected(row.sign === selectedSign);
    list.replaceChildren(...rows.map((row) => row.item));
  }

  function select(sign: TrafficSign | null): void {
    selectedSign = sign !== null && signs.includes(sign) ? sign : null;
    for (const row of rows) row.setSelected(row.sign === selectedSign);
  }

  function markUnavailable(): void {
    // Never keep displaying a count from a previous viewport when current
    // bounds cannot be read; that would claim a stale count as current.
    header.textContent = "Sign count unavailable";
    list.replaceChildren();
    signs = [];
    rows = [];
    selectedSign = null;
  }
}

/** The header is the count: the user reads how many signs the view holds. */
function countText(count: number): string {
  return count === 1 ? "1 sign in view" : `${count} signs in view`;
}

function buildRow(document: Document, sign: TrafficSign): SignRow {
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
  body.append(name);

  row.append(icon, code, body);

  // A sign without a registry note (`Huomautus` null) has no notes at all:
  // neither a preview nor an expansion target, so nothing about it is rendered
  // and the row cannot expand into an empty block (AC-21).
  const notes = sign.notes;
  const notesDisclosure = notes === null ? null : buildNotesDisclosure(document, notes);
  if (notesDisclosure !== null) body.append(notesDisclosure.preview);

  let notesExpanded = false;
  row.addEventListener("click", () => {
    if (notesDisclosure === null) return;
    notesExpanded = !notesExpanded;
    row.setAttribute("aria-expanded", String(notesExpanded));
    notesDisclosure.full.hidden = !notesExpanded;
  });

  item.append(row);
  // Keep the row and its truncated preview in place; expansion adds the full
  // note beneath them instead of replacing either part of the row.
  if (notesDisclosure !== null) item.append(notesDisclosure.full);
  return {
    sign,
    item,
    setSelected(selected: boolean): void {
      row.classList.toggle(SIGN_ROW_SELECTED_CLASS, selected);
      row.setAttribute("aria-pressed", String(selected));
      if (notesDisclosure !== null) {
        notesExpanded = selected;
        row.setAttribute("aria-expanded", String(notesExpanded));
        notesDisclosure.full.hidden = !notesExpanded;
      }
    },
  };
}

interface NotesDisclosure {
  preview: HTMLElement;
  full: HTMLElement;
}

function buildNotesDisclosure(document: Document, notes: string): NotesDisclosure {
  const preview = document.createElement("span");
  preview.className = SIGN_ROW_NOTES_CLASS;
  preview.textContent = notes;

  const full = document.createElement("div");
  full.className = SIGN_ROW_NOTES_FULL_CLASS;
  full.textContent = notes;
  full.hidden = true;

  return { preview, full };
}
