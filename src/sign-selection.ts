import { sameTrafficSign, type TrafficSign } from "./data/traffic-sign";

const LOG_PREFIX = "[turku-signs]";

/** The view that can start a selection; it decides the view reaction. */
export type SelectionOrigin = "marker" | "panel";

/** Who started a selection change; views choose their reaction from it. */
export type SelectionSource = SelectionOrigin | "system";

/** The selected Traffic Sign and whether its inline details are open. */
export interface SignSelectionState {
  readonly sign: TrafficSign | null;
  readonly detailsOpen: boolean;
}

/** One published selection change, tagged with the view that started it. */
export interface SignSelectionChange extends SignSelectionState {
  readonly source: SelectionSource;
}

/**
 * The one owner of the selected Traffic Sign (spec §4.5): a marker click, a
 * Sign Panel row click and a viewport clear all write here, and the Visual
 * Overlay and Sign Panel read from here instead of keeping their own copies.
 */
export interface SignSelection {
  current(): SignSelectionState;
  /** Selects a sign; details open when the sign carries notes. */
  select(sign: TrafficSign, source: SelectionOrigin): void;
  /** Flips the inline details of the selected sign, if it has notes. */
  toggleDetails(): void;
  /** Clears the selection; each view drops the rows and highlights it owns. */
  clear(): void;
  /**
   * Replaces the selected sign with the same registry key, as a dataset swap
   * does, without changing which sign is selected.
   */
  reconcile(sign: TrafficSign): void;
  subscribe(listener: (change: SignSelectionChange) => void): () => void;
}

export function openSignSelection(): SignSelection {
  let selected: TrafficSign | null = null;
  let detailsOpen = false;
  const listeners = new Set<(change: SignSelectionChange) => void>();

  return { current, select, toggleDetails, clear, reconcile, subscribe };

  function current(): SignSelectionState {
    return { sign: selected, detailsOpen };
  }

  function select(sign: TrafficSign, source: SelectionOrigin): void {
    selected = sign;
    detailsOpen = sign.notes !== null;
    notify(source);
  }

  function toggleDetails(): void {
    if (selected === null || selected.notes === null) return;
    detailsOpen = !detailsOpen;
    notify("panel");
  }

  function clear(): void {
    if (selected === null) return;
    selected = null;
    detailsOpen = false;
    notify("system");
  }

  function reconcile(sign: TrafficSign): void {
    if (selected === null || !sameTrafficSign(selected, sign)) return;
    selected = sign;
    detailsOpen = detailsOpen && sign.notes !== null;
    notify("system");
  }

  function subscribe(listener: (change: SignSelectionChange) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function notify(source: SelectionSource): void {
    const change: SignSelectionChange = { sign: selected, detailsOpen, source };
    for (const listener of listeners) {
      try {
        listener(change);
      } catch (error) {
        console.error(`${LOG_PREFIX} Sign Selection subscriber failed.`, error);
      }
    }
  }
}
