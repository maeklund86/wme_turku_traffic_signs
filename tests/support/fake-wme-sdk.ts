import { vi } from "vitest";

/**
 * Structural stand-in for the SDK surface the bootstrap ticket uses:
 * Sidebar.registerScriptTab (real DOM elements) and the wme-ready event bus.
 */
export function createFakeWmeSdk() {
  const sidebarHost = document.createElement("div");
  document.body.appendChild(sidebarHost);
  const registerScriptTab = vi.fn(async () => {
    const tabLabel = document.createElement("span");
    const tabPane = document.createElement("div");
    sidebarHost.append(tabLabel, tabPane);
    return { tabLabel, tabPane };
  });
  const wmeReadyHandlers: Array<() => void> = [];
  const sdk = {
    Sidebar: { registerScriptTab },
    Events: {
      on: vi.fn(({ eventName, eventHandler }: { eventName: string; eventHandler: () => void }) => {
        if (eventName !== "wme-ready") throw new Error(`unexpected event: ${eventName}`);
        wmeReadyHandlers.push(eventHandler);
        return () => {};
      }),
    },
  };
  return {
    sdk,
    registerScriptTab,
    emitWmeReady: () => {
      for (const handler of wmeReadyHandlers) handler();
    },
  };
}
