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
  SIGN_ROW_CATEGORY_CLASS,
  SIGN_ROW_CLASS,
  SIGN_ROW_CODE_CLASS,
  SIGN_ROW_DISCLOSURE_CLASS,
  SIGN_ROW_ICON_CLASS,
  SIGN_ROW_NAME_CLASS,
  SIGN_ROW_NOTES_FULL_CLASS,
  SIGN_ROW_SELECTED_CLASS,
} from "../constants";
import { SIGN_PLATE_HEIGHT, SIGN_PLATE_WIDTH } from "../visual-overlay/marker-graphics";

/**
 * The Sign Panel's stylesheet, injected once per page document. Every selector
 * is rooted under the panel content wrapper, so these rules cannot style WME's
 * own elements even though the stylesheet lives in the page document.
 */

const STYLE_ELEMENT_ID = "turku-signs-sign-panel-styles";

/**
 * The viewport list: each button is a grid row (icon, code, name, category and
 * an optional disclosure arrow). Names truncate with an ellipsis. Rows are
 * buttons, so note disclosure keeps native keyboard support and the
 * `aria-expanded` state.
 */
const SIGN_PANEL_CSS = `
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_CATEGORY_FILTER_CLASS} { margin: 0 0 8px; }
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_CATEGORY_FILTER_CLASS} > summary { cursor: pointer; font-weight: 600; }
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_CATEGORY_FILTER_ACTIONS_CLASS},
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_CATEGORY_CHIPS_CLASS} { display: flex; flex-wrap: wrap; gap: 4px; }
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_CATEGORY_FILTER_ACTIONS_CLASS} { margin: 4px 0; }
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_CATEGORY_FILTER_ACTION_CLASS},
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_CATEGORY_CHIP_CLASS} {
  box-sizing: border-box;
  max-width: 100%;
  padding: 2px 8px;
  border: 1px solid #888888;
  border-radius: 999px;
  background: #ffffff;
  cursor: pointer;
  white-space: normal;
}
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_CATEGORY_CHIP_CLASS} code {
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.08);
  font-family: inherit;
  font-size: 0.9em;
  font-weight: 600;
  padding: 0 3px;
}
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_CATEGORY_CHIP_CLASS}[aria-pressed="true"] {
  border-color: #466080;
  background: #dce7f5;
}
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_LIST_CLASS} { list-style: none; margin: 0; padding: 0; }
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_LIST_CLASS} > li + li { margin-top: 8px; }
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_LIST_HEADER_CLASS} { margin: 8px 0 4px; font-weight: bold; }
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_ROW_CLASS} {
  display: grid;
  grid-template-columns: ${SIGN_PLATE_WIDTH}px minmax(3em, auto) minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px;
  width: 100%;
  /* WME fixes button height at 32px; rows need room for multiline details. */
  height: auto !important;
  padding: 2px 4px;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
}
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_ROW_CLASS}:hover { background: rgba(0, 0, 0, 0.06); }
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_ROW_SELECTED_CLASS} { background: #dce7f5; outline: 1px solid #466080; }
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_ROW_ICON_CLASS} {
  width: ${SIGN_PLATE_WIDTH}px;
  height: ${SIGN_PLATE_HEIGHT}px;
  object-fit: contain;
}
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_ROW_CODE_CLASS} { font-weight: 600; }
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_ROW_DISCLOSURE_CLASS} { color: #555555; font-size: 1.1em; font-weight: 600; line-height: 1; }
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_ROW_BODY_CLASS} { display: flex; flex-direction: column; min-width: 0; }
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_ROW_CATEGORY_CLASS} { color: #555555; font-size: 0.9em; }
.${SIGN_PANEL_CONTENT_CLASS} .${SIGN_ROW_NAME_CLASS} { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
