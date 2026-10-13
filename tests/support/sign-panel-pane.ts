import { vi } from "vitest";

import { OUTSIDE_TURKU_COVERAGE_CLASS, SIGN_VISIBILITY_TOGGLE_CLASS } from "../../src/constants";

/** The `registerScriptTab` spy `createFakeWmeSdk` hands out. */
type RegisterScriptTab = ReturnType<typeof vi.fn>;

/** The pane WME handed the script, read from the spy's Nth registered tab. */
export async function paneOf(registerScriptTab: RegisterScriptTab, index = 0): Promise<HTMLElement> {
  const result = registerScriptTab.mock.results[index];
  if (!result) throw new Error("registerScriptTab was never called");
  return (await result.value).tabPane as HTMLElement;
}

/** The visibility checkbox the Sign Panel renders into its pane. */
export function toggleOf(pane: HTMLElement): HTMLInputElement {
  const toggle = pane.querySelector<HTMLInputElement>(`.${SIGN_VISIBILITY_TOGGLE_CLASS}`);
  if (!toggle) throw new Error("the visibility checkbox was never rendered");
  return toggle;
}

/** The one-line notice shown in place of a usable toggle outside coverage. */
export function noticeOf(pane: HTMLElement): HTMLElement {
  const notice = pane.querySelector<HTMLElement>(`.${OUTSIDE_TURKU_COVERAGE_CLASS}`);
  if (!notice) throw new Error("the coverage notice was never rendered");
  return notice;
}

/** Clicks the checkbox the way a user does: set the state, fire the change. */
export async function toggleCheckbox(pane: HTMLElement, checked: boolean): Promise<void> {
  const toggle = toggleOf(pane);
  toggle.checked = checked;
  toggle.dispatchEvent(new Event("change", { bubbles: true }));
  // The handler persists asynchronously; let it settle before asserting.
  await new Promise((resolve) => setTimeout(resolve, 0));
}
