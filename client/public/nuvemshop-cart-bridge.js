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

function exposeBridge(addItems) {
  window.__LUUP_NUVEMSHOP_ADD_TO_CART__ = addItems;
  window.LuupNuvemshopCart = Object.assign({}, window.LuupNuvemshopCart, {
    addItems,
    status: "ready",
  });
  try {
    window.dispatchEvent(new CustomEvent("luup:nuvemshop-cart-bridge-ready"));
  } catch (_) {}
}

if (typeof window !== "undefined") {
  window.LuupNuvemshopCart = Object.assign({}, window.LuupNuvemshopCart, {
    status: "waiting_for_nubesdk",
  });
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

  exposeBridge(addItems);
}
