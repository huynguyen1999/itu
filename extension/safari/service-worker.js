import { createController } from "./controller.js";
import { createActivityStore } from "./activity.js";
import { createSafariAdapter } from "./adapter.js";

const api = globalThis.browser ?? globalThis.chrome;

export function startSafariController(webExtensionApi = api, dependencies = {}) {
  const adapter = createSafariAdapter(webExtensionApi, dependencies);
  const options = dependencies.store ? dependencies : { ...dependencies, store: createActivityStore(webExtensionApi) };
  return createController(adapter, options);
}

if (api) startSafariController();
