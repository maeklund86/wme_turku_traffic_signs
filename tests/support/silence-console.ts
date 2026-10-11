import { vi } from "vitest";

/** The service logs every degradation path by design; keep test output clean. */
export function silenceConsole(): void {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
}
