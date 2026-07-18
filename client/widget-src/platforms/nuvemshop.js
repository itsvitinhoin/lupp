// Lupp widget – Nuvemshop platform adapter. Built standalone into
// public/widget-nuvemshop.js and lazily injected by the core widget once the
// bootstrap payload identifies a Nuvemshop store (immediately at startup in
// NubeSDK frame mode). Shares config/state/helpers with the core through
// window.__LUPP_WIDGET_BRIDGE__ and answers the feed iframe's
// LUPP_NUVEMSHOP_ADD_TO_CART_REQUEST messages.
(function () {
  "use strict";

  var bridge = window.__LUPP_WIDGET_BRIDGE__;
  if (!bridge || !bridge.adapters || bridge.adapters.nuvemshop) return;

  var state = bridge.state;
  var emitCartEvent = bridge.utils.emitCartEvent;
  var isNuvemshopStore = bridge.isNuvemshopStore;
  var isTrustedLuppFrameOrigin = bridge.isTrustedLuppFrameOrigin;
  var postFrameResponse = bridge.postFrameResponse;
  var updateNuvemshopCartCounters = bridge.updateNuvemshopCartCounters;

  function notifyNuvemshopCartUpdated(items) {
    var quantity = (items || []).reduce(function (sum, item) {
      return sum + Number(item.quantity || 0);
    }, 0);
    var detail = {
      items: items || [],
      provider: "nuvemshop",
      quantity: quantity,
      source: "luup",
    };

    [
      "luup:nuvemshop-cart-updated",
      "luup:cart-updated",
      "storefront:cart-updated",
      "cart:updated",
      "cart:refresh",
    ].forEach(function (eventName) {
      emitCartEvent(eventName, detail);
    });

    updateNuvemshopCartCounters(quantity);
    state.pendingStorefrontCartRefresh = true;
    state.pendingStorefrontCartDetail = detail;
  }

  function getNuvemshopCartBridge() {
    return (
      window.__LUUP_NUVEMSHOP_ADD_TO_CART__ ||
      (window.LuupNuvemshopCart && window.LuupNuvemshopCart.addItems)
    );
  }

  function waitForNuvemshopCartBridge(deadline) {
    var bridge = getNuvemshopCartBridge();
    if (typeof bridge === "function") return Promise.resolve(bridge);
    if (Date.now() >= deadline) {
      return Promise.reject(new Error("nuvemshop_cart_bridge_not_ready"));
    }
    return new Promise(function (resolve, reject) {
      window.setTimeout(function () {
        waitForNuvemshopCartBridge(deadline).then(resolve).catch(reject);
      }, 120);
    });
  }

  function postNativeNuvemshopCartItem(item) {
    if (!window.fetch || !window.URLSearchParams) {
      return Promise.reject(new Error("nuvemshop_cart_bridge_not_ready"));
    }

    var body = new URLSearchParams();
    body.set("add_to_cart", String(item.product_id));
    body.set("quantity", String(item.quantity));
    body.set("variant_id", String(item.variant_id));

    return fetch("/comprar/", {
      body: body.toString(),
      cache: "no-store",
      credentials: "include",
      headers: {
        Accept: "text/html,application/json,*/*",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
      },
      method: "POST",
      redirect: "follow",
    }).then(function (response) {
      if (response.ok || response.redirected) return {};
      return response
        .text()
        .catch(function () {
          return "";
        })
        .then(function (text) {
          throw new Error(
            text && text.length < 160 ? text : "nuvemshop_native_cart_failed",
          );
        });
    });
  }

  function addNuvemshopItemsWithNativeCart(validItems) {
    return validItems.reduce(function (promise, item) {
      return promise.then(function () {
        return postNativeNuvemshopCartItem(item);
      });
    }, Promise.resolve()).then(function () {
      return { method: "native_form_post" };
    });
  }

  function addNuvemshopItemsToCart(items) {
    if (!isNuvemshopStore(state.activeStore)) {
      return Promise.reject(new Error("nuvemshop_store_not_detected"));
    }

    var validItems = (Array.isArray(items) ? items : [])
      .map(function (item) {
        var productId = Number(item && item.product_id);
        var variantId = Number(item && item.variant_id);
        var quantity = Number(item && item.quantity);
        if (
          !Number.isFinite(productId) ||
          !Number.isFinite(variantId) ||
          !Number.isFinite(quantity)
        ) {
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

    if (!validItems.length) {
      return Promise.reject(new Error("empty_cart_items"));
    }

    return waitForNuvemshopCartBridge(Date.now() + 6000)
      .then(function (bridge) {
        return Promise.resolve(bridge(validItems)).then(function (result) {
          notifyNuvemshopCartUpdated(validItems);
          return result || {};
        });
      })
      .catch(function (bridgeError) {
        return addNuvemshopItemsWithNativeCart(validItems)
          .then(function (result) {
            notifyNuvemshopCartUpdated(validItems);
            return result || {};
          })
          .catch(function () {
            throw bridgeError;
          });
      });
  }

  window.addEventListener("message", function (event) {
    var data = event.data || {};
    if (
      !data ||
      data.type !== "LUPP_NUVEMSHOP_ADD_TO_CART_REQUEST" ||
      !isTrustedLuppFrameOrigin(event.origin)
    ) {
      return;
    }

    addNuvemshopItemsToCart(data.items)
      .then(function () {
        postFrameResponse(
          event.source,
          event.origin,
          "LUPP_NUVEMSHOP_ADD_TO_CART_RESPONSE",
          data.requestId,
          { ok: true },
        );
      })
      .catch(function (error) {
        postFrameResponse(
          event.source,
          event.origin,
          "LUPP_NUVEMSHOP_ADD_TO_CART_RESPONSE",
          data.requestId,
          {
            error:
              error && error.message
                ? error.message
                : "nuvemshop_cart_request_failed",
            ok: false,
          },
        );
      });
  });

  bridge.adapters.nuvemshop = {
    addItemsToCart: addNuvemshopItemsToCart,
  };
})();
