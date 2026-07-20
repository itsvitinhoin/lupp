import { iframe } from "@tiendanube/nube-sdk-ui";
import type { NubeSDK, NubeSDKState } from "@tiendanube/nube-sdk-types";

/**
 * Luup NubeSDK app (worker entry — upload the built
 * `public/nuvemshop-nubesdk-app.js` to the Partners portal script with
 * "Use NubeSDK" ENABLED). Runs in Nuvemshop's sandboxed web worker: no DOM.
 *
 * All rendering happens inside `nuvemshop-widget-frame.html` (our origin),
 * embedded via the SDK's iframe component in the corner slot matching the
 * dashboard's launcher position. The frame hosts the real widget.js, so
 * appearance/display rules keep coming from the widget bootstrap. Contracts:
 *
 * - frame → worker `{type:"resize", width, height}`: handled by the SDK
 *   itself (`autoresize: true`) — the same message the frame has always
 *   posted for the legacy sandbox integration.
 * - frame → worker `{type:"LUPP_NUBESDK_CART_ADD", requestId, items}`:
 *   relayed to `nube.send("cart:add")`; the outcome returns to the frame as
 *   `{type:"LUPP_NUBESDK_CART_RESULT", requestId, ok, error?}` via
 *   `postMessageToIframe`. The frame exposes this relay as
 *   `window.__LUUP_NUVEMSHOP_ADD_TO_CART__`, which the widget's nuvemshop
 *   adapter already prefers over its native form-POST fallback.
 */

const LUUP_APP_URL: `https://${string}` = "https://luup.dzns.com.br";
const LUUP_API_URL = "https://luup.dzns.net";
const CART_TIMEOUT_MS = 12000;

type CartAddItem = { product_id: number; variant_id: number; quantity: number };

type FrameMessage =
  | { type: "resize"; width?: number; height?: number }
  | { type: "LUPP_NUBESDK_CART_ADD"; requestId: string; items: CartAddItem[] };

// The docs' corner_* "fixed slots" are not rendered by current themes (their
// server-side slot sets carry only content-anchored slots), so the launcher
// mounts in `before_main_content` — present on every storefront page — and
// floats to the configured corner via fixed positioning on the iframe itself.
const LAUNCHER_SLOT = "before_main_content";

type LauncherStyle = Record<string, string | number>;

function launcherStyleFor(
  position: string,
  offsetX: number,
  offsetY: number,
): LauncherStyle {
  const style: LauncherStyle = {
    position: "fixed",
    zIndex: 2147483000,
    border: "none",
    background: "transparent",
  };
  style[position.includes("top") ? "top" : "bottom"] = `${offsetY}px`;
  style[position.includes("right") ? "right" : "left"] = `${offsetX}px`;
  return style;
}

function frameSrc(state: NubeSDKState): `https://${string}` {
  const params = new URLSearchParams({
    mode: "launcher",
    external_store_id: String(state.store?.id ?? ""),
    store_domain: String(state.store?.domain ?? ""),
    page_url: String(state.location?.url ?? ""),
  });
  return `${LUUP_APP_URL}/nuvemshop-widget-frame.html?${params.toString()}`;
}

export function App(nube: NubeSDK) {
  const pendingCartRequests: Array<{
    requestId: string;
    timeout: ReturnType<typeof setTimeout>;
  }> = [];

  let launcherFrame: ReturnType<typeof iframe> | null = null;

  function replyToFrame(requestId: string, ok: boolean, error?: string) {
    if (!launcherFrame) return;
    nube.getBrowserAPIs().postMessageToIframe(launcherFrame, {
      type: "LUPP_NUBESDK_CART_RESULT",
      requestId,
      ok,
      ...(error ? { error } : {}),
    });
  }

  function settleNextCartRequest(ok: boolean, error?: string) {
    const pending = pendingCartRequests.shift();
    if (!pending) return;
    clearTimeout(pending.timeout);
    replyToFrame(pending.requestId, ok, error);
  }

  nube.on("cart:add:success", () => settleNextCartRequest(true));
  nube.on("cart:add:fail", (state) => {
    const payload = (state as { eventPayload?: { message?: string; error?: string } })
      .eventPayload;
    settleNextCartRequest(false, payload?.message || payload?.error || "nuvemshop_cart_add_failed");
  });

  function handleCartAdd(message: Extract<FrameMessage, { type: "LUPP_NUBESDK_CART_ADD" }>) {
    const items = (Array.isArray(message.items) ? message.items : [])
      .map((item) => ({
        product_id: Math.trunc(Number(item?.product_id)),
        variant_id: Math.trunc(Number(item?.variant_id)),
        quantity: Math.trunc(Number(item?.quantity)),
      }))
      .filter((item) => item.product_id > 0 && item.variant_id > 0 && item.quantity > 0);

    if (!items.length) {
      replyToFrame(message.requestId, false, "empty_cart_items");
      return;
    }

    const timeout = setTimeout(() => {
      const index = pendingCartRequests.findIndex(
        (pending) => pending.requestId === message.requestId,
      );
      if (index !== -1) {
        pendingCartRequests.splice(index, 1);
        replyToFrame(message.requestId, false, "nuvemshop_cart_timeout");
      }
    }, CART_TIMEOUT_MS);
    pendingCartRequests.push({ requestId: message.requestId, timeout });

    // One cart:add per item mirrors the platform contract; success/fail
    // events settle requests in FIFO order.
    for (const item of items) {
      nube.send("cart:add", () => ({ cart: { items: [item] } }) as never);
    }
  }

  function onFrameMessage(event: { type: "message"; state: NubeSDKState; value?: unknown }) {
    const message = (event?.value ?? {}) as FrameMessage;
    if (message?.type === "LUPP_NUBESDK_CART_ADD") handleCartAdd(message);
    // "resize" is consumed by the SDK host itself (autoresize) — nothing to do.
  }

  async function renderLauncher(state: NubeSDKState) {
    const externalStoreId = String(state.store?.id ?? "");
    if (!externalStoreId) return;

    // The worker has fetch: ask the bootstrap whether the widget should show
    // at all (billing gate + display rules for this page) and where the
    // launcher sits. Any failure → render nothing (never break the store).
    let position = "bottom-left";
    let offsetX = 18;
    let offsetY = 18;
    try {
      const query = new URLSearchParams({
        widget: "floating_launcher",
        external_store_id: externalStoreId,
        url: String(state.location?.url ?? ""),
      });
      const response = await fetch(`${LUUP_API_URL}/api/widget/bootstrap?${query.toString()}`);
      if (!response.ok) return;
      const payload = (await response.json()) as {
        active?: boolean;
        display?: { show?: boolean };
        config?: { launcher?: { position?: string; offset_x?: number; offset_y?: number } };
      };
      if (payload.active === false || payload.display?.show === false) return;
      position = payload.config?.launcher?.position || position;
      if (Number.isFinite(payload.config?.launcher?.offset_x)) {
        offsetX = Number(payload.config?.launcher?.offset_x);
      }
      if (Number.isFinite(payload.config?.launcher?.offset_y)) {
        offsetY = Number(payload.config?.launcher?.offset_y);
      }
    } catch {
      return;
    }

    launcherFrame = iframe({
      id: "luup-widget-frame",
      src: frameSrc(state),
      width: "150px",
      height: "190px",
      autoresize: true,
      style: launcherStyleFor(position, offsetX, offsetY),
      onMessage: onFrameMessage,
    });
    nube.render(LAUNCHER_SLOT, launcherFrame);
  }

  void renderLauncher(nube.getState());
}
