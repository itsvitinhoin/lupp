// Lupp widget – Upzero platform adapter. Built standalone into
// public/widget-upzero.js and lazily injected by the core widget once the
// bootstrap payload identifies an Upzero store (or when the feed overlay
// needs Upzero customer-status detection). Shares config/state/helpers with
// the core through window.__LUPP_WIDGET_BRIDGE__ and answers the feed
// iframe's LUPP_UPZERO_ADD_TO_CART_REQUEST messages.
import type {
  CustomerStatus,
  StorePayload,
  UpzeroCartItem,
  WidgetBridge,
} from "../types";

// Loose view of the Next.js server-action cart result.
type UpzeroActionResult = {
  ok?: unknown;
  error?: unknown;
  cart?: Record<string, unknown> | null;
  [key: string]: unknown;
};

(function () {
  "use strict";

  var bridgeInstance = window.__LUPP_WIDGET_BRIDGE__;
  if (
    !bridgeInstance ||
    !bridgeInstance.adapters ||
    bridgeInstance.adapters.upzero
  ) {
    return;
  }
  var bridge: WidgetBridge = bridgeInstance;

  var state = bridge.state;
  var externalStoreId = bridge.config.externalStoreId;
  var upzeroProxyBase = bridge.config.upzeroProxyBase;
  var resolveUrl = bridge.utils.resolveUrl;
  var getUrlPathname = bridge.utils.getUrlPathname;
  var sameStorefrontHostname = bridge.utils.sameStorefrontHostname;
  var emitCartEvent = bridge.utils.emitCartEvent;
  var isUpzeroStore = bridge.isUpzeroStore;
  var isTrustedLuppFrameOrigin = bridge.isTrustedLuppFrameOrigin;
  var postFrameResponse = bridge.postFrameResponse;
  var updateUpzeroCartCounters = bridge.updateUpzeroCartCounters;

  function normalizeCustomerStatus(value: unknown): string {
    return String(value || "")
      .trim()
      .toUpperCase();
  }

  function isApprovedCustomerStatus(status: unknown): boolean {
    var normalized = normalizeCustomerStatus(status);
    return normalized === "APPROVED" || normalized === "ACTIVE";
  }

  function readKnownUpzeroCustomer(): Record<string, unknown> | null {
    try {
      var candidates = [
        window.UPZERO_CLIENT,
        window.UPZERO_CUSTOMER,
        window.upzeroClient,
        window.upzeroCustomer,
      ];
      for (var index = 0; index < candidates.length; index += 1) {
        var candidate = candidates[index];
        if (candidate && typeof candidate === "object") {
          return candidate as Record<string, unknown>;
        }
      }
    } catch (_) {}
    return null;
  }

  function parseJsonSafe(value: unknown): unknown {
    try {
      return JSON.parse(value as string);
    } catch (_) {
      return null;
    }
  }

  function isLikelyJwt(value: unknown): boolean {
    return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(
      String(value || "").trim(),
    );
  }

  function cleanBearerToken(value: unknown): string {
    var token = String(value || "").trim();
    if (!token) return "";
    token = token.replace(/^Bearer\s+/i, "").trim();
    return token;
  }

  function tokenFromObject(value: unknown): string {
    if (!value || typeof value !== "object") return "";
    var record = value as Record<string, unknown>;
    var keys = [
      "clientAuthToken",
      "client_auth_token",
      "authToken",
      "accessToken",
      "access_token",
      "token",
      "jwt",
    ];
    for (var index = 0; index < keys.length; index += 1) {
      var token = cleanBearerToken(record[keys[index]]);
      if (token && isLikelyJwt(token)) return token;
    }
    for (var nestedKey in record) {
      if (!Object.prototype.hasOwnProperty.call(record, nestedKey)) continue;
      if (typeof record[nestedKey] === "object") {
        var nestedToken = tokenFromObject(record[nestedKey]);
        if (nestedToken) return nestedToken;
      }
    }
    return "";
  }

  function readStorageToken(storage: Storage | null | undefined): string {
    if (!storage) return "";
    var preferredKeys = [
      "clientAuthToken",
      "client_auth_token",
      "upzero_client_auth_token",
      "upzeroClientAuthToken",
      "upzero.clientAuthToken",
      "upzero.auth.token",
      "upzero_auth_token",
      "authToken",
      "accessToken",
      "access_token",
      "token",
    ];

    try {
      for (var index = 0; index < preferredKeys.length; index += 1) {
        var directValue = storage.getItem(preferredKeys[index]);
        var directToken = cleanBearerToken(directValue);
        if (directToken && isLikelyJwt(directToken)) return directToken;

        var parsedDirect = parseJsonSafe(directValue);
        var parsedDirectToken = tokenFromObject(parsedDirect);
        if (parsedDirectToken) return parsedDirectToken;
      }

      for (var itemIndex = 0; itemIndex < storage.length; itemIndex += 1) {
        var key = storage.key(itemIndex);
        if (!key) continue;
        var lowerKey = key.toLowerCase();
        if (
          lowerKey.indexOf("auth") === -1 &&
          lowerKey.indexOf("token") === -1 &&
          lowerKey.indexOf("client") === -1 &&
          lowerKey.indexOf("customer") === -1 &&
          lowerKey.indexOf("upzero") === -1
        ) {
          continue;
        }

        var value = storage.getItem(key);
        var token = cleanBearerToken(value);
        if (token && isLikelyJwt(token)) return token;

        var parsed = parseJsonSafe(value);
        var parsedToken = tokenFromObject(parsed);
        if (parsedToken) return parsedToken;
      }
    } catch (_) {}
    return "";
  }

  function readCookieToken() {
    try {
      var cookies = document.cookie ? document.cookie.split(";") : [];
      for (var index = 0; index < cookies.length; index += 1) {
        var cookie = cookies[index].trim();
        var separatorIndex = cookie.indexOf("=");
        if (separatorIndex === -1) continue;
        var name = cookie.slice(0, separatorIndex).trim().toLowerCase();
        var value = decodeURIComponent(cookie.slice(separatorIndex + 1));
        if (
          name !== "clientauthtoken" &&
          name !== "client_auth_token" &&
          name.indexOf("authtoken") === -1 &&
          name.indexOf("auth_token") === -1
        ) {
          continue;
        }
        var token = cleanBearerToken(value);
        if (token && isLikelyJwt(token)) return token;
      }
    } catch (_) {}
    return "";
  }

  function readUpzeroAuthToken() {
    var knownCustomer = readKnownUpzeroCustomer();
    var knownToken = tokenFromObject(knownCustomer);
    if (knownToken) return knownToken;

    var localToken = readStorageToken(window.localStorage);
    if (localToken) return localToken;

    var sessionToken = readStorageToken(window.sessionStorage);
    if (sessionToken) return sessionToken;

    return readCookieToken();
  }

  function decodeBase64Url(value: string): string {
    try {
      var normalized = String(value || "")
        .replace(/-/g, "+")
        .replace(/_/g, "/");
      while (normalized.length % 4) normalized += "=";
      return decodeURIComponent(
        Array.prototype.map
          .call(window.atob(normalized), function (char) {
            return "%" + ("00" + char.charCodeAt(0).toString(16)).slice(-2);
          })
          .join(""),
      );
    } catch (_) {
      return "";
    }
  }

  function decodeJwtPayload(token: string): unknown {
    try {
      var payload = String(token || "").split(".")[1];
      if (!payload) return null;
      return parseJsonSafe(decodeBase64Url(payload));
    } catch (_) {
      return null;
    }
  }

  function statusFromToken(token: string): string {
    var payload = decodeJwtPayload(token);
    if (!payload || typeof payload !== "object") return "";
    var record = payload as Record<string, unknown>;
    return normalizeCustomerStatus(
      record.status ||
        record.client_status ||
        record.customer_status ||
        record.account_status ||
        "",
    );
  }

  function pageTextWithoutLuppWidgets() {
    var body = document.body;
    if (!body) return "";
    if (!body.querySelector("[data-lupp-widget-root],[data-lupp-feed-overlay]")) {
      return String(body.innerText || "");
    }
    var clone = body.cloneNode(true) as HTMLElement;
    var ownNodes = clone.querySelectorAll(
      "[data-lupp-widget-root],[data-lupp-feed-overlay],script,style",
    );
    for (var index = 0; index < ownNodes.length; index += 1) {
      if (ownNodes[index].parentNode) {
        ownNodes[index].parentNode!.removeChild(ownNodes[index]);
      }
    }
    return String(clone.textContent || "");
  }

  function inferUpzeroCustomerStatusFromPage(): CustomerStatus | null {
    try {
      // Widget-rendered copy ("Entre ou cadastre-se para visualizar valores")
      // must not feed this inference, or render -> infer -> re-render loops.
      var text = pageTextWithoutLuppWidgets()
        .replace(/\s+/g, " ")
        .toLowerCase();
      if (!text) return null;

      var showsAccount =
        text.indexOf("minha conta") > -1 ||
        text.indexOf("minhas compras") > -1 ||
        text.indexOf("meus pedidos") > -1 ||
        text.indexOf("meus dados") > -1 ||
        text.indexOf("olá,") > -1 ||
        text.indexOf("sair") > -1 ||
        text.indexOf("logout") > -1;
      var asksForLogin =
        text.indexOf("cadastre-se para ver") > -1 ||
        text.indexOf("faça login para ver") > -1 ||
        text.indexOf("entre para ver") > -1 ||
        text.indexOf("entre ou cadastre-se") > -1 ||
        text.indexOf("visualizar valores") > -1;

      if (asksForLogin && !showsAccount) {
        return {
          approved: false,
          loggedIn: false,
          source: "page",
          status: "UNAUTHENTICATED",
        };
      }

      if (showsAccount) {
        return {
          approved: true,
          loggedIn: true,
          source: "page",
          status: "ACTIVE",
        };
      }
    } catch (_) {}
    return null;
  }


  function isLoggedOutUpzeroStatus(status: CustomerStatus | null): boolean {
    return Boolean(
      status &&
        (status.loggedIn === false ||
          normalizeCustomerStatus(status.status) === "UNAUTHENTICATED"),
    );
  }

  function upzeroProxyHeaders(): Record<string, string> {
    var headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    var authToken = readUpzeroAuthToken();
    if (authToken) headers.Authorization = "Bearer " + authToken;
    return headers;
  }

  function upzeroProxyRequest(
    action: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Response> {
    if (!state.activeStore || !state.activeStore.id) {
      return Promise.reject(new Error("upzero_store_not_ready"));
    }
    var payload = body && typeof body === "object" ? body : {};
    payload.action = action;
    payload.store_id = state.activeStore.id;

    return fetch(upzeroProxyBase, {
      body: JSON.stringify(payload),
      cache: "no-store",
      credentials: "omit",
      headers: upzeroProxyHeaders(),
      method: "POST",
      signal: signal,
    });
  }

  function detectUpzeroCustomerStatus(
    store: StorePayload | null,
    options?: { forceRefresh?: boolean },
  ): Promise<CustomerStatus> {
    var forceRefresh = Boolean(options && options.forceRefresh);
    if (!isUpzeroStore(store)) {
      return Promise.resolve({
        approved: true,
        loggedIn: true,
        source: "not_upzero",
        status: "not_applicable",
      });
    }

    var inferredCustomer = inferUpzeroCustomerStatusFromPage();
    if (isLoggedOutUpzeroStatus(inferredCustomer)) {
      state.upzeroCustomerStatusCache = inferredCustomer;
      state.upzeroCustomerStatusLastRefreshAt = Date.now();
      // isLoggedOutUpzeroStatus is only true for a non-null status, so the
      // cache is a CustomerStatus here (tsc cannot see through the helper).
      return Promise.resolve(state.upzeroCustomerStatusCache as CustomerStatus);
    }

    if (state.upzeroCustomerStatusCache && !forceRefresh) {
      return Promise.resolve(state.upzeroCustomerStatusCache);
    }

    if (inferredCustomer && inferredCustomer.approved) {
      state.upzeroCustomerStatusCache = inferredCustomer;
      state.upzeroCustomerStatusLastRefreshAt = Date.now();
      return Promise.resolve(state.upzeroCustomerStatusCache);
    }

    var knownCustomer = readKnownUpzeroCustomer();
    if (
      knownCustomer &&
      (!forceRefresh || isApprovedCustomerStatus(knownCustomer.status))
    ) {
      state.upzeroCustomerStatusCache = {
        approved: isApprovedCustomerStatus(knownCustomer.status),
        loggedIn: true,
        source: "window",
        status: normalizeCustomerStatus(knownCustomer.status || "UNKNOWN"),
      };
      state.upzeroCustomerStatusLastRefreshAt = Date.now();
      return Promise.resolve(state.upzeroCustomerStatusCache);
    }

    if (inferredCustomer) {
      state.upzeroCustomerStatusCache = inferredCustomer;
      state.upzeroCustomerStatusLastRefreshAt = Date.now();
      return Promise.resolve(state.upzeroCustomerStatusCache);
    }

    function fetchUpzeroCustomerStatus(
      authToken: string,
    ): Promise<CustomerStatus> {
      var controller =
        typeof AbortController !== "undefined" ? new AbortController() : null;
      var timeout = window.setTimeout(function () {
        if (controller) controller.abort();
      }, 4000);

      return upzeroProxyRequest(
        "customer_status",
        {},
        controller ? controller.signal : undefined,
      )
        .then(function (response) {
          window.clearTimeout(timeout);
          if (response.status === 401) {
            return {
              approved: false,
              loggedIn: false,
              source: authToken ? "bearer_proxy" : "storefront_proxy",
              status: "UNAUTHENTICATED",
            };
          }
          if (!response.ok) throw new Error("upzero_client_status_unavailable");
          return response.json().then(function (payload) {
            var client =
              payload && payload.data && typeof payload.data === "object"
                ? payload.data
                : payload;
            var status = normalizeCustomerStatus(client && client.status);
            return {
              approved: isApprovedCustomerStatus(status),
              loggedIn: true,
              source: authToken ? "bearer_proxy" : "storefront_proxy",
              status: status || "UNKNOWN",
            };
          });
        })
        .catch(function (error) {
          window.clearTimeout(timeout);
          throw error;
        });
    }

    var authToken = readUpzeroAuthToken();
    var tokenStatus = statusFromToken(authToken);
    var request = authToken
      ? fetchUpzeroCustomerStatus(authToken)
          .then(function (status) {
            if (status.loggedIn || status.approved) return status;
            return fetchUpzeroCustomerStatus("");
          })
          .catch(function () {
            return fetchUpzeroCustomerStatus("");
          })
      : fetchUpzeroCustomerStatus("");

    return request
      .catch(function () {
        var latestInferredCustomer = inferUpzeroCustomerStatusFromPage();
        if (latestInferredCustomer) return latestInferredCustomer;
        if (authToken && tokenStatus && isApprovedCustomerStatus(tokenStatus)) {
          return {
            approved: true,
            loggedIn: true,
            source: "token",
            status: tokenStatus,
          };
        }
        return {
          approved: false,
          loggedIn: false,
          source: authToken ? "bearer_fallback" : "fallback",
          status: "UNKNOWN",
        };
      })
      .then(function (status) {
        state.upzeroCustomerStatusCache = status;
        state.upzeroCustomerStatusLastRefreshAt = Date.now();
        return status;
      });
  }

  function parseUpzeroServerActionResult(
    text: string,
  ): UpzeroActionResult | null {
    function findResult(value: unknown, depth: number): UpzeroActionResult | null {
      if (!value || depth > 4) return null;
      if (
        typeof value === "object" &&
        ("ok" in value || "cart" in value || "error" in value)
      ) {
        return value as UpzeroActionResult;
      }
      if (Array.isArray(value)) {
        for (var arrayIndex = 0; arrayIndex < value.length; arrayIndex += 1) {
          var arrayResult = findResult(value[arrayIndex], depth + 1);
          if (arrayResult) return arrayResult;
        }
        return null;
      }
      if (typeof value === "object") {
        var record = value as Record<string, unknown>;
        for (var key in record) {
          if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
          var objectResult = findResult(record[key], depth + 1);
          if (objectResult) return objectResult;
        }
      }
      return null;
    }

    var lines = String(text || "").split(/\n/);
    for (var index = 0; index < lines.length; index += 1) {
      var line = lines[index];
      if (!line) continue;
      var separatorIndex = line.indexOf(":");
      if (separatorIndex <= 0) continue;
      try {
        var payload = JSON.parse(line.slice(separatorIndex + 1));
        var result = findResult(payload, 0);
        if (result) return result;
      } catch (_) {
        continue;
      }
    }
    return null;
  }

  function isRecoverableUpzeroCartError(error: unknown): boolean {
    var message = String(
      (error && (error as { message?: unknown }).message) || error || "",
    );
    return /server action not found|failed to find server action|upzero_cart_action_not_found|upzero_product_page_unavailable|upzero_cart_request_failed|failed to fetch|networkerror|load failed|cors/i.test(
      message,
    );
  }

  function normalizeUpzeroActionUrl(url: string | undefined): string {
    var fallback =
      (state.upzeroConfig && state.upzeroConfig.storefront_url) ||
      (state.activeStore && state.activeStore.url) ||
      window.location.href;
    var resolved = url || fallback;
    try {
      resolved = resolveUrl(resolved, fallback);
      if (typeof URL !== "undefined") {
        var parsed = new URL(resolved, window.location.href);
        var current = new URL(window.location.href);
        var isUpzeroProductPath =
          isUpzeroStore(state.activeStore) && /\/produtos\//i.test(parsed.pathname);
        if (
          (isUpzeroProductPath ||
            sameStorefrontHostname(parsed.hostname, current.hostname)) &&
          (parsed.hostname !== current.hostname ||
            parsed.protocol !== current.protocol ||
            parsed.port !== current.port)
        ) {
          parsed.protocol = current.protocol;
          parsed.hostname = current.hostname;
          parsed.port = current.port;
          return parsed.href;
        }
      }
      return resolved;
    } catch (_) {
      return resolved;
    }
  }

  // Cart-action discovery is server-side now: the bootstrap ships
  // upzero_config.cart_action_ids, and the upzero-proxy exposes a
  // discover_cart_context action (the server scrapes and caches per store)
  // for when they are missing or stale.
  function getServerCartContext(
    productPath: string,
    forceRefresh: boolean,
  ): Promise<{ actionIds: string[]; storeId: number | null }> {
    var configuredIds =
      state.upzeroConfig && Array.isArray(state.upzeroConfig.cart_action_ids)
        ? state.upzeroConfig.cart_action_ids.filter(Boolean)
        : [];
    if (!forceRefresh && configuredIds.length) {
      return Promise.resolve({
        actionIds: configuredIds,
        storeId:
          Number(
            state.upzeroConfig && state.upzeroConfig.storefront_store_id,
          ) || null,
      });
    }
    return upzeroProxyRequest("discover_cart_context", {
      product_path: productPath || "",
      force_refresh: Boolean(forceRefresh),
    }).then(function (response) {
      if (!response.ok) throw new Error("upzero_cart_action_not_found");
      return response.json().then(function (payload) {
        var data =
          payload && payload.data && typeof payload.data === "object"
            ? payload.data
            : payload;
        var actionIds = (
          data && Array.isArray(data.cart_action_ids)
            ? data.cart_action_ids
            : []
        ).filter(Boolean);
        var discoveredStoreId = Number(data && data.storefront_store_id);
        var hasStoreId =
          Number.isFinite(discoveredStoreId) && discoveredStoreId > 0;
        if (state.upzeroConfig) {
          if (actionIds.length) {
            state.upzeroConfig.cart_action_ids = actionIds;
          }
          if (hasStoreId) {
            state.upzeroConfig.storefront_store_id =
              Math.trunc(discoveredStoreId);
          }
        }
        if (!actionIds.length) {
          throw new Error("upzero_cart_action_not_found");
        }
        return {
          actionIds: actionIds,
          storeId: hasStoreId ? Math.trunc(discoveredStoreId) : null,
        };
      });
    });
  }

  function findUpzeroStoreIdInObject(
    value: unknown,
    depth: number,
  ): number | null {
    if (!value || typeof value !== "object" || depth > 8) return null;
    var record = value as Record<string, unknown>;

    var directKeys = [
      "storefrontStoreId",
      "storefront_store_id",
      "storeId",
      "store_id",
      "upzeroStoreId",
      "upzero_store_id",
    ];

    for (var index = 0; index < directKeys.length; index += 1) {
      var directValue = Number(record[directKeys[index]]);
      if (Number.isFinite(directValue) && directValue > 0) {
        return Math.trunc(directValue);
      }
    }

    var nestedStore =
      record.store || record.storefront || record.storefrontStore;
    if (nestedStore && typeof nestedStore === "object") {
      var nestedRecord = nestedStore as Record<string, unknown>;
      var nestedId = Number(nestedRecord.id || nestedRecord.storeId);
      if (Number.isFinite(nestedId) && nestedId > 0) return Math.trunc(nestedId);
    }

    for (var key in record) {
      if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
      var child = record[key];
      if (!child || typeof child !== "object") continue;
      var found = findUpzeroStoreIdInObject(child, depth + 1);
      if (found) return found;
    }

    return null;
  }

  function readUpzeroStorefrontStoreIdFromWindow(): number | null {
    var globals = [
      window.__NEXT_DATA__,
      window.__UPZERO_DATA__,
      window.__STORE__,
      window.__STORE_DATA__,
    ];

    for (var index = 0; index < globals.length; index += 1) {
      var storeId = findUpzeroStoreIdInObject(globals[index], 0);
      if (storeId) return storeId;
    }

    return null;
  }

  function inferUpzeroStorefrontStoreId(): number | null {
    var candidates = [
      state.upzeroConfig && state.upzeroConfig.storefront_store_id,
      state.upzeroConfig && state.upzeroConfig.store_id,
      state.upzeroConfig && state.upzeroConfig.upzero_store_id,
      externalStoreId,
      state.activeStore && state.activeStore.external_store_id,
      state.activeStore && state.activeStore.storefront_store_id,
      state.activeStore && state.activeStore.upzero_store_id,
      state.activeStore && state.activeStore.settings
        ? (state.activeStore.settings as { store_id?: unknown }).store_id
        : null,
      readUpzeroStorefrontStoreIdFromWindow(),
      window.UPZERO_STORE_ID,
      window.__UPZERO_STORE_ID__,
      window.storeId,
    ];

    for (var index = 0; index < candidates.length; index += 1) {
      var value = Number(candidates[index]);
      if (Number.isFinite(value) && value > 0) return Math.trunc(value);
    }

    try {
      var storageKey = Object.keys(window.localStorage || {}).find(function (
        key,
      ) {
        return /^storefront_cart_session_\d+$/.test(key);
      });
      var storageMatch = storageKey && storageKey.match(/_(\d+)$/);
      if (storageMatch) return Number(storageMatch[1]);
    } catch (_) {}

    try {
      var pathMatch = window.location.pathname.match(/^\/(\d+)(?:\/|$)/);
      if (pathMatch) return Number(pathMatch[1]);
    } catch (_) {}

    return null;
  }

  function upzeroCartSessionKey(storefrontStoreId: number | string): string {
    return "storefront_cart_session_" + storefrontStoreId;
  }

  function getUpzeroCartQuantity(
    cart: Record<string, unknown> | null,
    fallbackItems?: unknown[],
  ): number {
    var directCandidates = [
      cart && cart.total_quantity,
      cart && cart.totalQuantity,
      cart && cart.items_count,
      cart && cart.itemsCount,
      cart && cart.total_items,
      cart && cart.totalItems,
      cart && cart.quantity,
    ];

    for (var index = 0; index < directCandidates.length; index += 1) {
      var directValue = Number(directCandidates[index]);
      if (Number.isFinite(directValue) && directValue >= 0) {
        return Math.trunc(directValue);
      }
    }

    var items =
      (cart && Array.isArray(cart.items) && cart.items) ||
      (cart && Array.isArray(cart.cart_items) && cart.cart_items) ||
      (cart && Array.isArray(cart.lines) && cart.lines) ||
      (Array.isArray(fallbackItems) && fallbackItems) ||
      [];

    return items.reduce(function (total: number, item) {
      var quantity = Number(
        (item && item.quantity) || (item && item.qty) || (item && item.amount),
      );
      return total + (Number.isFinite(quantity) ? Math.max(0, quantity) : 0);
    }, 0);
  }

  function persistUpzeroCartSession(
    sessionId: unknown,
    storefrontStoreId: number | string,
  ): void {
    var normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedSessionId) return;

    try {
      window.localStorage.setItem(
        upzeroCartSessionKey(storefrontStoreId),
        normalizedSessionId,
      );
    } catch (_) {}

    try {
      var encoded = encodeURIComponent(normalizedSessionId);
      var maxAge = 60 * 60 * 24 * 30;
      document.cookie =
        "sessionID=" +
        encoded +
        "; path=/; max-age=" +
        maxAge +
        "; SameSite=Lax; Secure";
      document.cookie =
        upzeroCartSessionKey(storefrontStoreId) +
        "=" +
        encoded +
        "; path=/; max-age=" +
        maxAge +
        "; SameSite=Lax; Secure";
    } catch (_) {}
  }

  function notifyUpzeroCartUpdated(
    cart: Record<string, unknown> | null,
    storefrontStoreId: number | string,
    fallbackItems?: unknown[],
  ): void {
    if (cart && cart.session_id) {
      persistUpzeroCartSession(cart.session_id, storefrontStoreId);
    }

    var quantity = getUpzeroCartQuantity(cart, fallbackItems);
    var detail = {
      cart: cart || null,
      items: Array.isArray(fallbackItems) ? fallbackItems : [],
      quantity: quantity,
      storeId: storefrontStoreId,
    };
    var eventNames = [
      "luup:upzero-cart-updated",
      "luup:cart-updated",
      "upzero:cart:updated",
      "upzero:cart-updated",
      "storefront:cart:updated",
      "storefront:cart-updated",
      "cart:updated",
      "cart-updated",
      "cart:refresh",
      "cart-refresh",
    ];

    eventNames.forEach(function (eventName) {
      emitCartEvent(eventName, detail);
    });

    try {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: upzeroCartSessionKey(storefrontStoreId),
          newValue:
            cart && cart.session_id ? String(cart.session_id) : null,
          storageArea: window.localStorage,
          url: window.location.href,
        }),
      );
    } catch (_) {
      try {
        window.dispatchEvent(new Event("storage"));
      } catch (__) {}
    }

    updateUpzeroCartCounters(quantity);
    state.pendingStorefrontCartRefresh = true;
    state.pendingStorefrontCartDetail = detail;
  }

  function addUpzeroItemsToCartApi(
    items: UpzeroCartItem[],
    storefrontStoreId: number | string,
    sessionId: string | null,
  ): Promise<Record<string, unknown>> {
    var snakeItems = items.map(function (item) {
      var payload: Record<string, unknown> = {
        product_variant_id: item.productVariantId,
        quantity: item.quantity,
      };
      if (item.assetId) payload.asset_id = item.assetId;
      return payload;
    });
    var camelItems = items.map(function (item) {
      var payload: Record<string, unknown> = {
        productVariantId: item.productVariantId,
        quantity: item.quantity,
      };
      if (item.assetId) payload.assetId = item.assetId;
      return payload;
    });
    var payloads = [
      {
        items: snakeItems,
        session_id: sessionId || null,
        store_id: storefrontStoreId,
        type: "IN",
      },
      {
        items: camelItems,
        sessionId: sessionId || null,
        storeId: storefrontStoreId,
        type: "IN",
      },
      {
        cart_items: snakeItems,
        session_id: sessionId || null,
        store_id: storefrontStoreId,
        type: "IN",
      },
    ];

    function postPayload(
      payload: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
      return upzeroProxyRequest("cart_batch", {
        payloads: [payload],
        session_id: sessionId || null,
        storefront_store_id: storefrontStoreId,
      }).then(function (response) {
        return response
          .text()
          .catch(function () {
            return "";
          })
          .then(function (text) {
            var parsedPayload = null;
            try {
              parsedPayload = text ? JSON.parse(text) : null;
            } catch (_) {}
            if (!response.ok) {
              var apiMessage =
                (parsedPayload &&
                  (parsedPayload.message || parsedPayload.error)) ||
                (text && text.length < 200 ? text : "upzero_cart_api_failed");
              throw new Error(apiMessage);
            }
            var cart =
              (parsedPayload && parsedPayload.cart) ||
              (parsedPayload && parsedPayload.data) ||
              parsedPayload ||
              null;
            notifyUpzeroCartUpdated(cart, storefrontStoreId, items);
            return parsedPayload || {};
          });
      });
    }

    function tryPayload(
      index: number,
      lastError: Error | null,
    ): Promise<Record<string, unknown>> {
      if (index >= payloads.length) {
        throw lastError || new Error("upzero_cart_api_failed");
      }

      return postPayload(payloads[index]).catch(function (error) {
        return tryPayload(index + 1, error);
      });
    }

    return tryPayload(0, null);
  }

  function addUpzeroItemsToCart(
    items: unknown,
    options?: { productUrl?: string },
  ): Promise<unknown> {
    if (!isUpzeroStore(state.activeStore)) {
      return Promise.reject(new Error("upzero_store_not_detected"));
    }

    var validItems = (Array.isArray(items) ? items : [])
      .map(function (item) {
        var variantId = Number(item && item.product_variant_id);
        var quantity = Number(item && item.quantity);
        if (!Number.isFinite(variantId) || !Number.isFinite(quantity)) {
          return null;
        }
        if (variantId <= 0 || quantity <= 0) return null;
        var assetId = Number(item && item.asset_id);
        return {
          assetId: Number.isFinite(assetId) && assetId > 0 ? Math.trunc(assetId) : null,
          productVariantId: Math.trunc(variantId),
          quantity: Math.trunc(quantity),
        };
      })
      .filter(Boolean) as UpzeroCartItem[];

    if (!validItems.length) {
      return Promise.reject(new Error("empty_cart_items"));
    }

    var actionUrl = normalizeUpzeroActionUrl(options && options.productUrl);
    var actionPath = getUrlPathname(actionUrl, window.location.href);
    var storefrontStoreId = inferUpzeroStorefrontStoreId();
    var sessionId: string | null = null;
    var knownActionIds: string[] = [];
    var retriedWithFreshContext = false;

    function appendKnownActionIds(ids: unknown): boolean {
      var appended = false;
      (Array.isArray(ids) ? ids : []).forEach(function (id) {
        var normalized = String(id || "").toLowerCase();
        if (!normalized || knownActionIds.indexOf(normalized) !== -1) return;
        knownActionIds.push(normalized);
        appended = true;
      });
      return appended;
    }

    function sendWithAction(actionId: string): Promise<Response> {
      if (!actionId) return Promise.reject(new Error("upzero_cart_action_not_found"));
      return fetch(actionUrl, {
        body: JSON.stringify([
          {
            items: validItems,
            sessionId: sessionId || null,
            storeId: storefrontStoreId,
          },
        ]),
        cache: "no-store",
        credentials: "include",
        headers: {
          Accept: "text/x-component",
          "Content-Type": "text/plain;charset=UTF-8",
          "Next-Action": actionId,
        },
        method: "POST",
      });
    }

    function parseCartResponse(
      response: Response,
    ): Promise<Record<string, unknown>> {
      if (!response.ok) {
        return response
          .text()
          .catch(function () {
            return "";
          })
          .then(function (text) {
            throw new Error(
              text && text.length < 200 ? text : "upzero_cart_request_failed",
            );
          });
      }
      return response.text().then(function (text) {
        var payload = parseUpzeroServerActionResult(text);
        if (!payload || !payload.ok) {
          throw new Error(
            String((payload && payload.error) || "upzero_cart_request_failed"),
          );
        }
        var cartSessionId =
          payload.cart && payload.cart.session_id
            ? String(payload.cart.session_id)
            : "";
        if (cartSessionId) {
          // Guarded upstream: cart requests only run once the storefront
          // store id resolved (see prepareUpzeroCartContext).
          persistUpzeroCartSession(cartSessionId, storefrontStoreId as number);
        }
        notifyUpzeroCartUpdated(
          payload.cart || null,
          storefrontStoreId as number,
          validItems,
        );
        return payload;
      });
    }

    function tryKnownActions(
      index: number,
      lastError: Error | null,
    ): Promise<Record<string, unknown>> {
      if (index >= knownActionIds.length) {
        if (retriedWithFreshContext) {
          throw lastError || new Error("upzero_cart_action_not_found");
        }
        retriedWithFreshContext = true;
        return getServerCartContext(actionPath, true).then(function (context) {
          if (appendKnownActionIds(context && context.actionIds)) {
            return tryKnownActions(index, lastError);
          }
          throw lastError || new Error("upzero_cart_action_not_found");
        });
      }

      return sendWithAction(knownActionIds[index])
        .then(parseCartResponse)
        .catch(function (error) {
          if (isRecoverableUpzeroCartError(error)) {
            return tryKnownActions(index + 1, error);
          }
          throw error || lastError;
      });
    }

    function prepareUpzeroCartContext() {
      return getServerCartContext(actionPath, false)
        .then(function (context) {
          var discoveredStoreId = Number(context && context.storeId);
          if (Number.isFinite(discoveredStoreId) && discoveredStoreId > 0) {
            storefrontStoreId = Math.trunc(discoveredStoreId);
          }
          return context;
        })
        .catch(function (error) {
          if (storefrontStoreId) return null;
          throw error;
        });
    }

    return prepareUpzeroCartContext().then(function (context) {
      if (!storefrontStoreId) {
        return Promise.reject(
          new Error("upzero_storefront_store_id_not_found"),
        );
      }

      try {
        sessionId = window.localStorage.getItem(
          upzeroCartSessionKey(storefrontStoreId),
        );
      } catch (_) {}

      appendKnownActionIds(context ? context.actionIds : []);
      // Legacy action ids stay as a last-resort fallback behind the
      // server-provided ones.
      appendKnownActionIds([
        "4029045ebafb74fd2e206cf4086710b0e2a4de8c97",
        "406d6dc3473eb9842f60475c022d5883b09d4c8fea",
      ]);

      return tryKnownActions(0, null);
    }).catch(function (actionError) {
      if (actionError && !isRecoverableUpzeroCartError(actionError)) {
        throw actionError;
      }
      if (!storefrontStoreId) throw actionError;
      return addUpzeroItemsToCartApi(validItems, storefrontStoreId, sessionId);
    });
  }

  window.addEventListener("message", function (event) {
    var data = event.data || {};
    if (
      !data ||
      data.type !== "LUPP_UPZERO_ADD_TO_CART_REQUEST" ||
      !isTrustedLuppFrameOrigin(event.origin)
    ) {
      return;
    }

    addUpzeroItemsToCart(data.items, { productUrl: data.productUrl })
      .then(function () {
        postFrameResponse(
          event.source,
          event.origin,
          "LUPP_UPZERO_ADD_TO_CART_RESPONSE",
          data.requestId,
          { ok: true },
        );
      })
      .catch(function (error) {
        postFrameResponse(
          event.source,
          event.origin,
          "LUPP_UPZERO_ADD_TO_CART_RESPONSE",
          data.requestId,
          {
            error:
              error && error.message
                ? error.message
                : "upzero_cart_request_failed",
            ok: false,
          },
        );
      });
  });

  bridge.adapters.upzero = {
    addItemsToCart: addUpzeroItemsToCart,
    detectUpzeroCustomerStatus: detectUpzeroCustomerStatus,
  };
})();
