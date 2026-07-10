import { Iframe } from "@tiendanube/nube-sdk-jsx";
import type {
  JsonObject,
  NubeComponent,
  NubeSDK,
  NubeSDKState,
} from "@tiendanube/nube-sdk-types";

const APP_URL = "https://www.playluup.com.br";
const BOOTSTRAP_URL =
  "https://duktrvqfbvpfajuajhci.supabase.co/functions/v1/lupp-widget-bootstrap";

type CartItemInput = {
  product_id: number;
  quantity: number;
  variant_id: number;
};

type LuupBootstrap = {
  active?: boolean;
  error?: string | null;
  store?: { id?: string | null; slug?: string | null } | null;
  videos?: Array<{
    id?: string | null;
    thumbnail_url?: string | null;
    video_url?: string | null;
  }>;
};

type LuupMessage = JsonObject & {
  type?: string;
  requestId?: string;
  videoId?: string;
  productUrl?: string;
  previewVideoUrl?: string;
  previewPosterUrl?: string;
  items?: unknown;
};

function normalizeHostname(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function normalizeItems(items: unknown): CartItemInput[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const value = item as Partial<CartItemInput>;
      const productId = Number(value.product_id);
      const variantId = Number(value.variant_id);
      const quantity = Number(value.quantity);
      if (
        !Number.isFinite(productId) ||
        !Number.isFinite(variantId) ||
        !Number.isFinite(quantity) ||
        productId <= 0 ||
        variantId <= 0 ||
        quantity <= 0
      ) {
        return null;
      }
      return {
        product_id: Math.trunc(productId),
        variant_id: Math.trunc(variantId),
        quantity: Math.trunc(quantity),
      };
    })
    .filter((item): item is CartItemInput => Boolean(item));
}

function frameUrl(
  mode: "carousel" | "launcher",
  state: Readonly<NubeSDKState>,
) {
  const params = new URLSearchParams({
    mode,
    external_store_id: String(state.store.id),
    store_domain: normalizeHostname(state.store.domain),
    page_url: state.location.url,
  });
  return `${APP_URL}/nuvemshop-widget-frame.html?${params.toString()}` as `https://${string}`;
}

function feedUrl(
  storeSlug: string,
  message: LuupMessage,
  state: Readonly<NubeSDKState>,
) {
  const params = new URLSearchParams({
    embed: "1",
    autoplay_sound: "1",
    customer_logged_in: state.customer?.id ? "1" : "0",
    customer_approved: "1",
    customer_status: state.customer?.id ? "logged_in" : "not_applicable",
    product_url: String(message.productUrl || state.location.url || ""),
  });
  if (message.videoId) params.set("v", String(message.videoId));
  if (message.previewVideoUrl) {
    params.set("preview_video_url", String(message.previewVideoUrl));
  }
  if (message.previewPosterUrl) {
    params.set("preview_poster_url", String(message.previewPosterUrl));
  }
  return `${APP_URL}/s/${encodeURIComponent(storeSlug)}/feed?${params.toString()}` as `https://${string}`;
}

async function fetchBootstrap(state: Readonly<NubeSDKState>) {
  const params = new URLSearchParams({
    widget: "floating_video",
    mode: "preview",
    provider: "nuvemshop",
    external_store_id: String(state.store.id),
    store_domain: normalizeHostname(state.store.domain),
  });
  const response = await fetch(`${BOOTSTRAP_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`luup_bootstrap_${response.status}`);
  }
  return (await response.json()) as LuupBootstrap;
}

export function App(nube: NubeSDK) {
  const browser = nube.getBrowserAPIs();
  let bootstrap: LuupBootstrap | null = null;
  let bootstrapStoreId = "";
  let feedIframe: NubeComponent | null = null;
  const pendingCartRequests: string[] = [];

  async function getBootstrap(state: Readonly<NubeSDKState>) {
    const storeId = String(state.store.id || "");
    if (bootstrap && bootstrapStoreId === storeId) return bootstrap;
    bootstrap = await fetchBootstrap(state);
    bootstrapStoreId = storeId;
    return bootstrap;
  }

  function replyToFeed(message: JsonObject) {
    if (!feedIframe) return;
    browser.postMessageToIframe(feedIframe, message);
  }

  function navigateToProduct(url: string, state: Readonly<NubeSDKState>) {
    try {
      const target = new URL(url, state.location.url);
      const current = new URL(state.location.url);
      if (target.hostname !== current.hostname) return;
      browser.navigate(`${target.pathname}${target.search}${target.hash}` as `/${string}`);
    } catch (_) {
      // Ignore malformed or cross-store product URLs.
    }
  }

  async function openFeed(message: LuupMessage) {
    const state = nube.getState();
    const payload = await getBootstrap(state);
    if (!payload.active || !payload.store?.slug) return;

    feedIframe = Iframe({
      id: "luup-nuvemshop-feed",
      src: feedUrl(String(payload.store.slug), message, state),
      width: state.device.type === "mobile" ? "100%" : "430px",
      height: Math.max(
        520,
        Math.round(
          state.device.screen.innerHeight *
            (state.device.type === "mobile" ? 0.92 : 0.96),
        ),
      ),
      style: {
        border: "0",
        borderRadius: state.device.type === "mobile" ? "0" : "12px",
        background: "#000000",
        overflow: "hidden",
      },
      onMessage: ({ value }) => handleMessage(value as LuupMessage),
    });
    nube.render("modal_content", feedIframe);
  }

  function handleMessage(message: LuupMessage) {
    if (!message || typeof message !== "object") return;
    const state = nube.getState();

    if (message.type === "LUPP_NUBESDK_OPEN_FEED") {
      void openFeed(message);
      return;
    }

    if (message.type === "LUPP_OPEN_PRODUCT_PAGE_REQUEST" && message.productUrl) {
      navigateToProduct(String(message.productUrl), state);
      return;
    }

    if (message.type !== "LUPP_NUVEMSHOP_ADD_TO_CART_REQUEST") return;
    const items = normalizeItems(message.items);
    const requestId = String(message.requestId || "");
    if (!items.length || !requestId) {
      replyToFeed({
        type: "LUPP_NUVEMSHOP_ADD_TO_CART_RESPONSE",
        requestId,
        ok: false,
        error: "invalid_cart_items",
      });
      return;
    }

    pendingCartRequests.push(requestId);
    nube.send("cart:add", () => ({ cart: { items } }));
  }

  async function renderWidgets(state: Readonly<NubeSDKState>) {
    try {
      const payload = await getBootstrap(state);
      if (!payload.active) {
        nube.clearSlot("corner_bottom_left");
        nube.clearSlot("before_section_products_sale");
        return;
      }

      const launcher = Iframe({
        id: "luup-nuvemshop-launcher",
        src: frameUrl("launcher", state),
        width: state.device.type === "mobile" ? "116px" : "280px",
        height: "116px",
        autoresize: true,
        style: { border: "0", background: "transparent", overflow: "visible" },
        onMessage: ({ value }) => handleMessage(value as LuupMessage),
      });
      nube.render("corner_bottom_left", launcher);

      if (state.location.page.type === "home") {
        const carousel = Iframe({
          id: "luup-nuvemshop-carousel",
          src: frameUrl("carousel", state),
          width: "100%",
          height: state.device.type === "mobile" ? "560px" : "610px",
          autoresize: true,
          style: { border: "0", background: "transparent", overflow: "hidden" },
          onMessage: ({ value }) => handleMessage(value as LuupMessage),
        });
        nube.render("before_section_products_sale", carousel);
      } else {
        nube.clearSlot("before_section_products_sale");
      }
    } catch (_) {
      nube.clearSlot("corner_bottom_left");
      nube.clearSlot("before_section_products_sale");
    }
  }

  nube.on("cart:add:success", () => {
    const requestId = pendingCartRequests.shift();
    if (!requestId) return;
    replyToFeed({
      type: "LUPP_NUVEMSHOP_ADD_TO_CART_RESPONSE",
      requestId,
      ok: true,
    });
  });

  nube.on("cart:add:fail", () => {
    const requestId = pendingCartRequests.shift();
    if (!requestId) return;
    replyToFeed({
      type: "LUPP_NUVEMSHOP_ADD_TO_CART_RESPONSE",
      requestId,
      ok: false,
      error: "nuvemshop_cart_add_failed",
    });
  });

  nube.on("custom:modal:close", () => {
    feedIframe = null;
    pendingCartRequests.splice(0);
  });

  nube.on("page:loaded", (state) => void renderWidgets(state));
  nube.on("location:updated", (state) => void renderWidgets(state));
  void renderWidgets(nube.getState());
}
