# IndexedDB tests under vitest/jsdom — known pitfalls

jsdom ships no IndexedDB, so `fake-indexeddb` (devDependency) provides it: `import "fake-indexeddb/auto"` sets the global. Two runtime hangs live here; neither is visible to `tsc`, both surface as 5s vitest timeouts that stretch a suite run to ~45s.

## Pitfall 1: `cursor.delete()` + `cursor.continue()` hangs

Enumerating keys with a key cursor and calling `cursor.delete()` then `cursor.continue()` deadlocks under this combination. Enumerate first, delete after:

```ts
const keys = await request(store.getAllKeys());
for (const key of keys) {
  if (/* stranded */) await request(store.delete(key));
}
```

## Pitfall 2: a connection left open blocks `deleteDatabase`

`indexedDB.deleteDatabase` waits on open connections, and a blocked delete queues every later `open()` behind it — also a hang. Both sides must yield:

- **Production store** (`src/data/indexed-db-dataset-store.ts`): closes on `versionchange` (`database.onversionchange = () => database.close()`), which is correct behavior too — a later schema version needs the database.
- **Test helpers**: call `database.close()` after every raw open, as the seed/scan helpers in `indexed-db-dataset-store.test.ts` do.

The `beforeEach` in that test file deletes the database between tests, so any connection the suite leaves open poisons every subsequent test.

## Probing

To answer "does fake-indexeddb do X at all", a plain node script against `node_modules` (~150ms) beats a vitest run — no jsdom in the picture. Drop to a single-test vitest run (`vitest run <file> -t <name>`) only when the question is jsdom-specific, and keep the probe to one minimal case.
