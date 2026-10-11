/**
 * Key/value persistence seam. Abstracted so the Sign Panel state survives
 * WME reload/logout via userscript storage (Tampermonkey GM.*), while tests
 * and the no-GM fallback run against memory.
 */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
