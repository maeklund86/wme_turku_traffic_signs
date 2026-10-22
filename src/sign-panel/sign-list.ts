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
} from "../constants";
import type { TrafficSign } from "../data/traffic-sign";
import { resolveSignMarkerGraphic } from "../visual-overlay/marker-style";

/**
 * The Sign Panel's viewport-driven list (spec §4.5, AC-20/AC-21): a count
 * header over one self-contained row per sign inside the extent. It only ever
 * renders the signs it is handed — the viewport query against the in-memory
 * spatial index stays in the tab, which is where the extent comes from.
 */
export interface SignList {
  /** Replaces the rows with exactly these signs, in the order given. */
  render(signs: readonly TrafficSign[]): void;
}

/** Creates the list's header and rows inside the tab pane. */
export function openSignList(document: Document, pane: HTMLElement): SignList {
  const header = document.createElement("div");
  header.className = SIGN_LIST_HEADER_CLASS;

  const list = document.createElement("ul");
  list.className = SIGN_LIST_CLASS;

  pane.append(header, list);
  return { render };

  function render(signs: readonly TrafficSign[]): void {
    // Whole-list replacement, not patching: the extent decides membership, so
    // every move can reorder and re-crop the set at once. Rows arrive in fetch
    // order (the index's), which keeps the list stable across moves.
    header.textContent = countText(signs.length);
    list.replaceChildren(...signs.map((sign) => buildRow(document, sign)));
  }
}

/** The header is the count: the user reads how many signs the view holds. */
function countText(count: number): string {
  return count === 1 ? "1 sign in view" : `${count} signs in view`;
}

function buildRow(document: Document, sign: TrafficSign): HTMLElement {
  const item = document.createElement("li");

  const row = document.createElement("button");
  row.type = "button";
  row.className = SIGN_ROW_CLASS;
  row.setAttribute("aria-expanded", "false");

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
  let preview: HTMLElement | null = null;
  let fullNotes: HTMLElement | null = null;
  if (notes !== null) {
    preview = document.createElement("span");
    preview.className = SIGN_ROW_NOTES_CLASS;
    preview.textContent = notes;
    body.append(preview);

    fullNotes = document.createElement("div");
    fullNotes.className = SIGN_ROW_NOTES_FULL_CLASS;
    fullNotes.textContent = notes;
    fullNotes.hidden = true;
    item.append(fullNotes);
  }

  row.addEventListener("click", () => {
    // Inline disclosure: the row toggles its own full note beneath it. The list
    // stays exactly where it is — no popup, no list replacement (spec §4.5).
    const expanded = row.getAttribute("aria-expanded") === "true";
    row.setAttribute("aria-expanded", expanded ? "false" : "true");
    if (preview !== null && fullNotes !== null) {
      // Show the full note in place of the truncated preview, never both.
      preview.hidden = !expanded;
      fullNotes.hidden = expanded;
    }
  });

  item.append(row);
  return item;
}
