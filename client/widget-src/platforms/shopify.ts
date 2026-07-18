// Lupp widget – Shopify platform adapter. Built standalone into
// public/widget-shopify.js and lazily injected by the core widget once the
// bootstrap payload (or Shopify globals / *.myshopify.com external id)
// identifies a Shopify store. Shares config/state/helpers with the core
// through window.__LUPP_WIDGET_BRIDGE__ and answers the feed iframe's
// LUPP_SHOPIFY_ADD_TO_CART_REQUEST / LUPP_SHOPIFY_PRODUCT_REQUEST messages.
import type { ShopifyCartItem, WidgetBridge } from "../types";

// Loose view of Shopify's public product .js JSON.
type ShopifyVariantJson = {
  id?: number | string;
  available?: boolean;
  featured_image?: { src?: unknown } | string | null;
  options?: unknown[];
  [key: string]: unknown;
};

type ShopifyProductJson = {
  id?: number | string;
  handle?: string;
  title?: string;
  options?: unknown[];
  variants?: ShopifyVariantJson[];
  featured_image?: unknown;
  image?: unknown;
  [key: string]: unknown;
};

(function () {
  "use strict";

  var bridgeInstance = window.__LUPP_WIDGET_BRIDGE__;
  if (
    !bridgeInstance ||
    !bridgeInstance.adapters ||
    bridgeInstance.adapters.shopify
  ) {
    return;
  }
  var bridge: WidgetBridge = bridgeInstance;

  var state = bridge.state;
  var createAnchor = bridge.utils.createAnchor;
  var resolveUrl = bridge.utils.resolveUrl;
  var emitCartEvent = bridge.utils.emitCartEvent;
  var isShopifyStore = bridge.isShopifyStore;
  var isTrustedLuppFrameOrigin = bridge.isTrustedLuppFrameOrigin;
  var postFrameResponse = bridge.postFrameResponse;
  var updateShopifyCartCounters = bridge.updateShopifyCartCounters;

  function notifyShopifyCartUpdated(
    items: ShopifyCartItem[],
    cart: unknown,
  ): void {
    var quantity = (items || []).reduce(function (sum: number, item) {
      return sum + Number(item.quantity || 0);
    }, 0);
    var detail = {
      cart: cart || null,
      items: items || [],
      provider: "shopify",
      quantity: quantity,
      source: "luup",
    };

    [
      "luup:shopify-cart-updated",
      "luup:cart-updated",
      "storefront:cart-updated",
      "cart:updated",
      "cart:refresh",
      "theme:cart:change",
    ].forEach(function (eventName) {
      emitCartEvent(eventName, detail);
    });

    updateShopifyCartCounters(quantity);
    state.pendingStorefrontCartRefresh = true;
    state.pendingStorefrontCartDetail = detail;
  }

  function shopifyProductJsonUrl(productUrl: string | undefined): string {
    var resolved = resolveUrl(productUrl || window.location.href, window.location.href);
    var anchor = createAnchor(resolved);
    var path = String(anchor.pathname || "");
    var match = path.match(/\/products\/([^/?#]+)/i);
    if (!match) return "";
    return "/products/" + encodeURIComponent(decodeURIComponent(match[1])) + ".js";
  }

  function addShopifyProductJsonCandidate(
    candidates: string[],
    productUrl: string | undefined,
  ): void {
    var jsonUrl = shopifyProductJsonUrl(productUrl);
    if (!jsonUrl || candidates.indexOf(jsonUrl) !== -1) return;
    candidates.push(jsonUrl);
  }

  function shopifyProductJsonCandidates(
    productUrl: string | undefined,
  ): string[] {
    var candidates: string[] = [];
    addShopifyProductJsonCandidate(candidates, productUrl);
    try {
      var canonical = document.querySelector(
        'link[rel="canonical"]',
      ) as HTMLLinkElement | null;
      if (canonical && canonical.href) {
        addShopifyProductJsonCandidate(candidates, canonical.href);
      }
    } catch (_) {}
    addShopifyProductJsonCandidate(candidates, window.location.href);
    return candidates;
  }

  function fetchShopifyProductJson(
    productUrl?: string,
  ): Promise<ShopifyProductJson> {
    var candidates = shopifyProductJsonCandidates(productUrl);
    if (!candidates.length) {
      return Promise.reject(new Error("shopify_variant_not_found"));
    }

    function tryCandidate(
      index: number,
      lastError?: Error | null,
    ): Promise<ShopifyProductJson> {
      if (index >= candidates.length) {
        throw lastError || new Error("shopify_product_json_failed");
      }

      return fetch(candidates[index], {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      })
        .then(function (response) {
          if (!response.ok) throw new Error("shopify_product_json_failed");
          return response.json();
        })
        .catch(function (error) {
          return tryCandidate(index + 1, error);
        });
    }

    return tryCandidate(0).catch(function (error: Error) {
      if (error && error.message === "shopify_product_json_failed") {
        throw new Error("shopify_product_not_published");
      }
      throw error;
    });
  }

  function normalizeShopifyMoney(value: unknown): number | null {
    var amount = Number(value);
    if (!Number.isFinite(amount)) return null;
    if (Math.floor(amount) === amount && Math.abs(amount) >= 1000) {
      return amount / 100;
    }
    return amount;
  }

  function getShopifyOptionName(
    product: ShopifyProductJson | null,
    index: number,
  ): string {
    var options =
      product && Array.isArray(product.options) ? product.options : [];
    var option = options[index] as { name?: unknown } | string | null;
    if (typeof option === "string") return option;
    if (option && option.name) return String(option.name);
    return "";
  }

  function getShopifyVariantOptionValue(
    variant: ShopifyVariantJson | null | undefined,
    index: number,
  ): string {
    if (variant && Array.isArray(variant.options)) {
      return variant.options[index] == null ? "" : String(variant.options[index]);
    }
    var key = "option" + String(index + 1);
    return variant && variant[key] == null ? "" : String(variant![key]);
  }

  function normalizeShopifyProductForLupp(product: ShopifyProductJson | null) {
    var variants =
      product && Array.isArray(product.variants) ? product.variants : [];
    var options: string[] = [];
    var rawOptions =
      product && Array.isArray(product.options) ? product.options : [];
    for (var optionIndex = 0; optionIndex < rawOptions.length; optionIndex += 1) {
      var optionName = getShopifyOptionName(product, optionIndex);
      if (optionName) options.push(optionName);
    }

    return {
      external_id: product && product.id ? String(product.id) : "",
      handle: product && product.handle ? String(product.handle) : "",
      image_url:
        (product && (product.featured_image || product.image)) ||
        (variants[0] &&
          variants[0].featured_image &&
          (variants[0].featured_image as { src?: unknown }).src) ||
        null,
      options: options,
      title: product && product.title ? String(product.title) : "",
      variants: variants.map(function (variant, variantIndex: number) {
        var colorName = "";
        var sizeName = "";
        var selectedOptions: { name: string; value: string }[] = [];
        for (var index = 0; index < 3; index += 1) {
          var name = getShopifyOptionName(product, index);
          var value = getShopifyVariantOptionValue(variant, index);
          if (!name && !value) continue;
          selectedOptions.push({ name: name, value: value });
          if (/cor|color|colour/i.test(name)) colorName = value;
          if (/tam|tamanho|size/i.test(name)) sizeName = value;
        }
        if (!sizeName && selectedOptions.length === 1) sizeName = selectedOptions[0].value;
        if (!colorName && selectedOptions.length > 1) colorName = selectedOptions[0].value;

        var variantId = variant && variant.id ? String(variant.id) : "";
        var variantImage =
          (variant &&
            variant.featured_image &&
            ((variant.featured_image as { src?: unknown }).src ||
              variant.featured_image)) ||
          null;
        return {
          color_code: colorName || null,
          color_hex: null,
          color_name: colorName || null,
          compare_at_price: normalizeShopifyMoney(variant && variant.compare_at_price),
          external_id: variantId,
          id: variantId || "shopify-variant-" + String(variantIndex),
          image_url: variantImage || null,
          metadata: {
            available_for_sale: !(variant && variant.available === false),
            option1: getShopifyVariantOptionValue(variant, 0),
            option2: getShopifyVariantOptionValue(variant, 1),
            option3: getShopifyVariantOptionValue(variant, 2),
            public_product_json: true,
            raw_selected_options: selectedOptions,
          },
          price: normalizeShopifyMoney(variant && variant.price),
          size_code: sizeName || null,
          size_name: sizeName || null,
          status: "active",
          stock_qty: variant && variant.available === false ? 0 : null,
        };
      }),
    };
  }

  function resolveShopifyDefaultCartItem(
    productUrl: string | undefined,
  ): Promise<ShopifyCartItem> {
    return fetchShopifyProductJson(productUrl)
      .then(function (product) {
        var variants =
          product && Array.isArray(product.variants) ? product.variants : [];
        var variant =
          variants.find(function (item) {
            return item && item.available !== false;
          }) || variants[0];
        var variantId = Number(variant && variant.id);
        if (!Number.isFinite(variantId) || variantId <= 0) {
          throw new Error("shopify_variant_not_found");
        }
        return { id: Math.trunc(variantId), quantity: 1 };
      });
  }

  function postShopifyCartItems(
    validItems: ShopifyCartItem[],
  ): Promise<unknown> {
    var root = "/";
    try {
      root =
        window.Shopify &&
        window.Shopify.routes &&
        window.Shopify.routes.root
          ? String(window.Shopify.routes.root)
          : "/";
    } catch (_) {}
    if (root.slice(-1) !== "/") root += "/";

    return fetch(root + "cart/add.js", {
      body: JSON.stringify({ items: validItems }),
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
    })
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            return null;
          })
          .then(function (payload) {
            if (!response.ok) {
              throw new Error(
                (payload && (payload.description || payload.message || payload.error)) ||
                  "shopify_cart_request_failed",
              );
            }
            notifyShopifyCartUpdated(validItems, payload);
            return payload || {};
          });
      });
  }

  function addShopifyItemsToCart(
    items: unknown,
    options?: { productUrl?: string },
  ): Promise<unknown> {
    if (!isShopifyStore(state.activeStore)) {
      return Promise.reject(new Error("shopify_store_not_detected"));
    }

    var validItems = (Array.isArray(items) ? items : [])
      .map(function (item) {
        var variantId = Number((item && (item.variant_id || item.id)) || 0);
        var quantity = Number(item && item.quantity);
        if (!Number.isFinite(variantId) || !Number.isFinite(quantity)) {
          return null;
        }
        if (variantId <= 0 || quantity <= 0) return null;
        return {
          id: Math.trunc(variantId),
          quantity: Math.trunc(quantity),
        };
      })
      .filter(Boolean) as ShopifyCartItem[];

    if (!validItems.length) {
      return resolveShopifyDefaultCartItem(options && options.productUrl).then(
        function (item: ShopifyCartItem) {
          return postShopifyCartItems([item]);
        },
      );
    }

    return postShopifyCartItems(validItems);
  }

  window.addEventListener("message", function (event) {
    var data = event.data || {};
    if (
      !data ||
      data.type !== "LUPP_SHOPIFY_ADD_TO_CART_REQUEST" ||
      !isTrustedLuppFrameOrigin(event.origin)
    ) {
      return;
    }

    addShopifyItemsToCart(data.items, { productUrl: data.productUrl })
      .then(function () {
        postFrameResponse(
          event.source,
          event.origin,
          "LUPP_SHOPIFY_ADD_TO_CART_RESPONSE",
          data.requestId,
          { ok: true },
        );
      })
      .catch(function (error) {
        postFrameResponse(
          event.source,
          event.origin,
          "LUPP_SHOPIFY_ADD_TO_CART_RESPONSE",
          data.requestId,
          {
            error:
              error && error.message
                ? error.message
                : "shopify_cart_request_failed",
            ok: false,
          },
        );
      });
  });

  window.addEventListener("message", function (event) {
    var data = event.data || {};
    if (
      !data ||
      data.type !== "LUPP_SHOPIFY_PRODUCT_REQUEST" ||
      !isTrustedLuppFrameOrigin(event.origin)
    ) {
      return;
    }

    fetchShopifyProductJson(data.productUrl)
      .then(function (product) {
        postFrameResponse(
          event.source,
          event.origin,
          "LUPP_SHOPIFY_PRODUCT_RESPONSE",
          data.requestId,
          { ok: true, product: normalizeShopifyProductForLupp(product) },
        );
      })
      .catch(function (error) {
        postFrameResponse(
          event.source,
          event.origin,
          "LUPP_SHOPIFY_PRODUCT_RESPONSE",
          data.requestId,
          {
            error:
              error && error.message
                ? error.message
                : "shopify_product_json_failed",
            ok: false,
            product: null,
          },
        );
      });
  });

  bridge.adapters.shopify = {
    addItemsToCart: addShopifyItemsToCart,
    fetchProductJson: fetchShopifyProductJson,
    normalizeProductForLupp: normalizeShopifyProductForLupp,
  };
})();
