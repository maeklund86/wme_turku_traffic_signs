import { describe, expect, it, vi } from "vite-plus/test";

import { openSignSelection } from "../src/sign-selection";
import { sign } from "./support/turku-sign";

const WITH_NOTES = sign("1", 22.2, 60.4, { notes: "Additional details" });
const WITHOUT_NOTES = sign("2", 22.2, 60.4);

describe("Sign Selection", () => {
  it("starts empty and does not notify on subscribe", () => {
    const selection = openSignSelection();
    const listener = vi.fn();

    selection.subscribe(listener);

    expect(selection.current()).toEqual({ sign: null, detailsOpen: false });
    expect(listener).not.toHaveBeenCalled();
  });

  it("selects a Traffic Sign from the map and opens its details", () => {
    const selection = openSignSelection();
    const listener = vi.fn();
    selection.subscribe(listener);

    selection.select(WITH_NOTES, "marker");

    expect(selection.current()).toEqual({ sign: WITH_NOTES, detailsOpen: true });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({
      sign: WITH_NOTES,
      detailsOpen: true,
      source: "marker",
    });
  });

  it("selects a Traffic Sign with no notes with its details closed", () => {
    const selection = openSignSelection();

    selection.select(WITHOUT_NOTES, "marker");

    expect(selection.current()).toEqual({ sign: WITHOUT_NOTES, detailsOpen: false });
  });

  it("replaces the previous Traffic Sign and opens the new details", () => {
    const selection = openSignSelection();

    selection.select(WITH_NOTES, "marker");
    selection.select(WITHOUT_NOTES, "panel");

    expect(selection.current()).toEqual({ sign: WITHOUT_NOTES, detailsOpen: false });
  });

  it("toggles details only while the selected Traffic Sign has notes", () => {
    const selection = openSignSelection();
    selection.select(WITH_NOTES, "marker");

    selection.toggleDetails();
    expect(selection.current().detailsOpen).toBe(false);

    selection.toggleDetails();
    expect(selection.current().detailsOpen).toBe(true);

    selection.select(WITHOUT_NOTES, "marker");
    selection.toggleDetails();
    expect(selection.current().detailsOpen).toBe(false);
  });

  it("clears the selection and does not notify again when already clear", () => {
    const selection = openSignSelection();
    const listener = vi.fn();
    selection.select(WITH_NOTES, "marker");
    selection.subscribe(listener);

    selection.clear();

    expect(selection.current()).toEqual({ sign: null, detailsOpen: false });
    expect(listener).toHaveBeenCalledWith({ sign: null, detailsOpen: false, source: "system" });

    listener.mockClear();
    selection.clear();
    expect(listener).not.toHaveBeenCalled();
  });

  it("reconciles a replacement Traffic Sign by registry key and keeps details open", () => {
    const selection = openSignSelection();
    const listener = vi.fn();
    selection.select(WITH_NOTES, "marker");
    const replacement = sign("1", 22.2, 60.4, { notes: "Updated details" });
    selection.subscribe(listener);

    selection.reconcile(replacement);

    expect(selection.current()).toEqual({ sign: replacement, detailsOpen: true });
    expect(listener).toHaveBeenCalledWith({
      sign: replacement,
      detailsOpen: true,
      source: "system",
    });
  });

  it("closes details when a reconciled Traffic Sign loses its notes", () => {
    const selection = openSignSelection();
    selection.select(WITH_NOTES, "marker");

    selection.reconcile(sign("1", 22.2, 60.4, { notes: null }));

    expect(selection.current().detailsOpen).toBe(false);
  });

  it("ignores a reconcile for a different Traffic Sign", () => {
    const selection = openSignSelection();
    const listener = vi.fn();
    selection.select(WITH_NOTES, "marker");
    selection.subscribe(listener);

    selection.reconcile(WITHOUT_NOTES);

    expect(selection.current().sign).toBe(WITH_NOTES);
    expect(listener).not.toHaveBeenCalled();
  });

  it("stops notifying a listener after unsubscribe", () => {
    const selection = openSignSelection();
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribe = selection.subscribe(first);
    selection.subscribe(second);

    selection.select(WITH_NOTES, "marker");
    unsubscribe();
    selection.clear();

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledTimes(2);
  });
});
