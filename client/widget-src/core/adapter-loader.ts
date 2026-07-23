// Lupp widget – lazy platform-adapter loading. Adapters (Upzero, Shopify,
// Nuvemshop) ship in separately-built widget-{platform}.js files, injected
// next to widget.js once the bootstrap payload identifies the store's
// platform. This reads window.__LUPP_WIDGET_BRIDGE__ directly (rather than
// taking it as a parameter) to mirror exactly how the adapter files
// themselves access shared state — there is only ever one bridge instance.
import { resolveUrl } from "../utils";
import { ctx } from "../context";
import type { NuvemshopAdapter, ShopifyAdapter, AdapterPlatform, UpzeroAdapter } from "../types";

type AnyAdapter = UpzeroAdapter | NuvemshopAdapter | ShopifyAdapter;

const adapterLoadPromises: Partial<Record<AdapterPlatform, Promise<AnyAdapter>>> = {};

let cachedAdapterScriptBase: string | null = null;

// Adapters are served from the same directory as widget.js itself.
function adapterScriptBase(): string {
  if (cachedAdapterScriptBase === null) {
    cachedAdapterScriptBase = resolveUrl(ctx.script.src || "widget.js", window.location.href).replace(
      /[^/]*(?:[?#].*)?$/,
      "",
    );
  }
  return cachedAdapterScriptBase;
}

export function loadAdapter(platform: AdapterPlatform | ""): Promise<AnyAdapter> {
  if (!platform) {
    return Promise.reject(new Error("lupp_adapter_platform_missing"));
  }
  const pending = adapterLoadPromises[platform];
  if (pending) return pending;

  const loadPromise = new Promise<AnyAdapter>((resolve, reject) => {
    const bridge = window.__LUPP_WIDGET_BRIDGE__;
    const registered = bridge && bridge.adapters[platform];
    if (registered) {
      resolve(registered);
      return;
    }
    const adapterScript = document.createElement("script");
    adapterScript.async = true;
    adapterScript.src = adapterScriptBase() + "widget-" + platform + ".js";
    adapterScript.onload = () => {
      const adapter = window.__LUPP_WIDGET_BRIDGE__ && window.__LUPP_WIDGET_BRIDGE__.adapters[platform];
      if (adapter) {
        resolve(adapter);
      } else {
        reject(new Error("lupp_adapter_register_failed"));
      }
    };
    adapterScript.onerror = () => reject(new Error("lupp_adapter_load_failed"));
    (document.head || document.body || document.documentElement).appendChild(adapterScript);
  });
  adapterLoadPromises[platform] = loadPromise;
  return loadPromise;
}
