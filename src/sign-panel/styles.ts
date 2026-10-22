/**
 * The Sign Panel's stylesheet, injected once per page document. The panel's
 * elements carry stable classes and nothing else, so every visual decision
 * lives here rather than in inline styles scattered over the DOM builders.
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
.turku-signs-list { list-style: none; margin: 0; padding: 0; }
.turku-signs-list-header { margin: 8px 0 4px; font-weight: bold; }
.turku-signs-row {
  display: grid;
  grid-template-columns: 24px minmax(3em, auto) 1fr;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 2px 4px;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
}
.turku-signs-row:hover { background: rgba(0, 0, 0, 0.06); }
.turku-signs-row-icon { width: 22px; height: 22px; }
.turku-signs-row-code { font-weight: 600; }
.turku-signs-row-body { display: flex; flex-direction: column; min-width: 0; }
.turku-signs-row-name,
.turku-signs-row-notes { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.turku-signs-row-notes { color: #555555; font-size: 0.9em; }
.turku-signs-row-notes-full { padding: 2px 8px 4px 32px; }
`;

/** Adds the stylesheet to the document's head once; later calls only re-check. */
export function ensureSignPanelStyles(document: Document): void {
  if (document.getElementById(STYLE_ELEMENT_ID) !== null) return;
  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = SIGN_PANEL_CSS;
  document.head.appendChild(style);
}
