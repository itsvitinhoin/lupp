const LUUP_APP_URL = "https://luup.dzns.com.br";

function cleanStoreId(value) {
  if (value === undefined || value === null) return "";
  const text = String(value).trim();
  return text && text !== "undefined" && text !== "null" ? text : "";
}

function readBrowserStoreId() {
  try {
    if (window.LS && window.LS.store && window.LS.store.id !== undefined) {
      return cleanStoreId(window.LS.store.id);
    }
    if (window.LS && window.LS.store_id !== undefined) {
      return cleanStoreId(window.LS.store_id);
    }
    if (window.Tiendanube && window.Tiendanube.storeId !== undefined) {
      return cleanStoreId(window.Tiendanube.storeId);
    }
    const match = window.location.hostname.match(/^(\d+)\.lojavirtualnuvem\.com\.br$/i);
    if (match) return match[1];
  } catch (_) {}
  return "";
}

function readNubeStoreId(nube) {
  try {
    const candidates = [
      nube && nube.storeId,
      nube && nube.store_id,
      nube && nube.store && nube.store.id,
      nube && nube.state && nube.state.store && nube.state.store.id,
      nube && nube.initialState && nube.initialState.store && nube.initialState.store.id,
    ];
    for (const candidate of candidates) {
      const storeId = cleanStoreId(candidate);
      if (storeId) return storeId;
    }
    if (nube && typeof nube.getState === "function") {
      const state = nube.getState();
      if (state && typeof state.then !== "function") {
        return cleanStoreId(state.store && state.store.id);
      }
    }
  } catch (_) {}
  return "";
}

function readStoreDomain() {
  try {
    return window.location && window.location.hostname ? String(window.location.hostname) : "";
  } catch (_) {
    return "";
  }
}

function scheduleLuupLoader(callback) {
  const run = () => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(callback, { timeout: 2500 });
      return;
    }
    window.setTimeout(callback, 900);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
    return;
  }

  run();
}

function loadLuupLoader(nube, attempt = 0) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const externalStoreId = readNubeStoreId(nube) || readBrowserStoreId();
  const storeDomain = readStoreDomain();
  if (!externalStoreId && !storeDomain) {
    if (attempt < 40) {
      window.setTimeout(() => loadLuupLoader(nube, attempt + 1), 150);
    }
    return;
  }

  if (window.__LUUP_NUVEMSHOP_SDK_LOADER_REQUESTED__) return;
  window.__LUUP_NUVEMSHOP_SDK_LOADER_REQUESTED__ = true;
  window.__LUUP_NUVEMSHOP_SDK_STORE_ID__ = externalStoreId;

  // Config fallback consumed by nuvemshop-script.js readConfig — survives
  // Nuvemshop stripping or reordering the script URL query params.
  window.__LUUP_NUVEMSHOP_CONFIG__ = Object.assign(
    {},
    window.__LUUP_NUVEMSHOP_CONFIG__ || {},
    {
      lupp_auto_load_delay: "1800",
      lupp_external_store_id: externalStoreId || "",
      lupp_load_strategy: "balanced",
      lupp_ofi: "true",
      lupp_require_active: "true",
      lupp_store_domain: storeDomain || "",
      lupp_url: LUUP_APP_URL,
      lupp_widget: "floating_launcher",
    },
  );

  scheduleLuupLoader(() => {
    const script = document.createElement("script");
    script.async = true;
    if ("fetchPriority" in script) script.fetchPriority = "low";
    script.src =
      `${LUUP_APP_URL}/nuvemshop-script.js` +
      `?lupp_url=${encodeURIComponent(LUUP_APP_URL)}` +
      `&lupp_external_store_id=${encodeURIComponent(externalStoreId)}` +
      `&lupp_store_domain=${encodeURIComponent(storeDomain)}` +
      "&lupp_widget=floating_launcher" +
      "&lupp_require_active=true" +
      "&lupp_load_strategy=balanced" +
      "&lupp_auto_load_delay=1800" +
      "&lupp_ofi=true";
    (document.head || document.body || document.documentElement).appendChild(script);
  });
}

function normalizeItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const productId = Number(item && item.product_id);
      const variantId = Number(item && item.variant_id);
      const quantity = Number(item && item.quantity);
      if (!Number.isFinite(productId) || !Number.isFinite(variantId) || !Number.isFinite(quantity)) {
        return null;
      }
      if (productId <= 0 || variantId <= 0 || quantity <= 0) return null;
      return {
        product_id: Math.trunc(productId),
        quantity: Math.trunc(quantity),
        variant_id: Math.trunc(variantId),
      };
    })
    .filter(Boolean);
}

export function App(nube) {
  if (typeof window === "undefined") return;

  const pending = [];

  function finishNext(error, payload) {
    const request = pending.shift();
    if (!request) return;
    window.clearTimeout(request.timeout);
    if (error) {
      request.reject(error);
      return;
    }
    request.resolve(payload || {});
  }

  if (nube && typeof nube.on === "function") {
    nube.on("cart:add:success", (state) => {
      finishNext(null, state && state.eventPayload ? state.eventPayload : {});
    });
    nube.on("cart:add:fail", (state) => {
      const payload = state && state.eventPayload ? state.eventPayload : {};
      finishNext(new Error(payload.message || payload.error || "nuvemshop_cart_add_failed"));
    });
  }

  function addItems(items) {
    const validItems = normalizeItems(items);
    if (!validItems.length) {
      return Promise.reject(new Error("empty_cart_items"));
    }
    if (!nube || typeof nube.send !== "function") {
      return Promise.reject(new Error("nubesdk_not_ready"));
    }

    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        const index = pending.findIndex((item) => item.resolve === resolve);
        if (index !== -1) pending.splice(index, 1);
        reject(new Error("nuvemshop_cart_timeout"));
      }, 12000);

      pending.push({ reject, resolve, timeout });

      try {
        const result = nube.send("cart:add", () => ({
          cart: {
            items: validItems,
          },
        }));

        if (result && typeof result.then === "function") {
          result.catch((error) => {
            finishNext(error instanceof Error ? error : new Error("nuvemshop_cart_add_failed"));
          });
        }
      } catch (error) {
        finishNext(error instanceof Error ? error : new Error("nuvemshop_cart_add_failed"));
      }
    });
  }

  window.__LUUP_NUVEMSHOP_ADD_TO_CART__ = addItems;
  window.LuupNuvemshopCart = Object.assign({}, window.LuupNuvemshopCart, {
    addItems,
  });

  loadLuupLoader(nube);
}

loadLuupLoader();
