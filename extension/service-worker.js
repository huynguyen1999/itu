import { createActivityStore } from "./activity.js";
import { CHROMIUM_IDENTITY, createChromiumAdapter } from "./chromium-adapter.js";
import { createController as createCoreController } from "./controller.js";

export function createController(api, dependencies = {}) {
  const identity = dependencies.browserIdentity ?? dependencies.identity ??
    (dependencies.bundleId || dependencies.displayName ? dependencies : CHROMIUM_IDENTITY);
  const adapter = createChromiumAdapter(api, identity);
  const options = dependencies.store ? dependencies : { ...dependencies, store: createActivityStore(api) };
  return createCoreController(adapter, { ...options, browserIdentity: identity });
}

if (typeof chrome !== "undefined") createController(chrome);
