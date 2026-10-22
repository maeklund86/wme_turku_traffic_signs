import {
  SIGN_CATEGORY_CHIP_CLASS,
  SIGN_CATEGORY_CHIPS_CLASS,
  SIGN_CATEGORY_FILTER_ACTION_CLASS,
  SIGN_CATEGORY_FILTER_ACTIONS_CLASS,
  SIGN_CATEGORY_FILTER_CLASS,
  SIGN_LIST_CLASS,
  SIGN_LIST_HEADER_CLASS,
  SIGN_PANEL_CONTENT_CLASS,
  SIGN_ROW_BODY_CLASS,
  SIGN_ROW_CLASS,
  SIGN_ROW_CODE_CLASS,
  SIGN_ROW_ICON_CLASS,
  SIGN_ROW_NAME_CLASS,
  SIGN_ROW_NOTES_CLASS,
  SIGN_ROW_NOTES_FULL_CLASS,
} from "../constants";
import { SIGN_PLATE_HEIGHT, SIGN_PLATE_WIDTH } from "../visual-overlay/marker-graphics";

/**
 * The Sign Panel's stylesheet, injected once per page document. Every selector
 * is rooted under the panel content wrapper, so these rules cannot style WME's
 * own elements even though the stylesheet lives in the page document.
 */

const STYLE_ELEMENT_ID = "turku-signs-sign-panel-styles";

/**
 * The viewport list: rows are grid cells (icon, code, name over notes) whose
 * text truncates with an ellipsis — the truncation AC-21 asks for cannot be
 * expressed without CSS, so the preview lines set `white-space: nowrap` and
 * let the ellipsis do the work. Rows are buttons: expanding a row is a
 * disclosure, and a button comes with the keyboard support and the
 * `aria-expanded` state that follows it.
 */
const SIGN_PANEL_CSS = `
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_CATEGORY_FILTER_CLASS} { margin: 0 0 8px; }
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_CATEGORY_FILTER_CLASS} > summary { cursor: pointer; font-weight: 600; }
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_CATEGORY_FILTER_ACTIONS_CLASS},
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_CATEGORY_CHIPS_CLASS} { display: flex; flex-wrap: wrap; gap: 4px; }
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_CATEGORY_FILTER_ACTIONS_CLASS} { margin: 4px 0; }
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_CATEGORY_FILTER_ACTION_CLASS},
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_CATEGORY_CHIP_CLASS} {
  padding: 2px 8px;
  border: 1px solid #888888;
  border-radius: 999px;
  background: #ffffff;
  cursor: pointer;
}
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_CATEGORY_CHIP_CLASS}[aria-pressed="true"] {
  border-color: #466080;
  background: #dce7f5;
}
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_LIST_CLASS} { list-style: none; margin: 0; padding: 0; }
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_LIST_HEADER_CLASS} { margin: 8px 0 4px; font-weight: bold; }
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_ROW_CLASS} {
  display: grid;
  grid-template-columns: ${SIGN_PLATE_WIDTH}px minmax(3em, auto) 1fr;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 2px 4px;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
}
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_ROW_CLASS}:hover { background: rgba(0, 0, 0, 0.06); }
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_ROW_ICON_CLASS} {
  width: ${SIGN_PLATE_WIDTH}px;
  height: ${SIGN_PLATE_HEIGHT}px;
  object-fit: contain;
}
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_ROW_CODE_CLASS} { font-weight: 600; }
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_ROW_BODY_CLASS} { display: flex; flex-direction: column; min-width: 0; }
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_ROW_NAME_CLASS},
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_ROW_NOTES_CLASS} { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_ROW_NOTES_CLASS} { color: #555555; font-size: 0.9em; }
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_ROW_NOTES_FULL_CLASS} { padding: 2px 8px 4px ${SIGN_PLATE_WIDTH}px; }
`;

/** Adds the stylesheet to the document's head once; later calls only re-check. */
export function ensureSignPanelStyles(document: Document): void {
  if (document.getElementById(STYLE_ELEMENT_ID) !== null) return;
  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = SIGN_PANEL_CSS;
  document.head.appendChild(style);
}
