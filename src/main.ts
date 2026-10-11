import { bootstrap, type SdkHostWindow } from "./bootstrap";
import { createUserscriptStore } from "./userscript-storage";

// With grants declared the script runs in an isolated world: the SDK, the WME
// document and userscript storage live behind unsafeWindow / GM.
const pageWindow: SdkHostWindow =
  typeof unsafeWindow !== "undefined" ? unsafeWindow : (window as unknown as SdkHostWindow);
const pageDocument: Document =
  typeof unsafeWindow !== "undefined" && unsafeWindow.document ? unsafeWindow.document : document;

void bootstrap({
  pageWindow,
  document: pageDocument,
  storage: createUserscriptStore(),
}).catch((error: unknown) => {
  console.error("[turku-signs] Bootstrap failed", error);
});
