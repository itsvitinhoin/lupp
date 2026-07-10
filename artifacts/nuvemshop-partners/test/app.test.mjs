import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

globalThis.self = { __APP_DATA__: { id: "luup-test" } };

const listeners = new Map();
const rendered = new Map();
const sent = [];
const iframeMessages = [];

const state = {
  cart: { items: [], prices: {}, coupon: {}, validation: { status: "success" } },
  config: {},
  customer: null,
  device: {
    type: "desktop",
    screen: {
      width: 1440,
      height: 900,
      innerWidth: 1440,
      innerHeight: 820,
      orientation: "landscape",
      pixelRatio: 1,
    },
  },
  eventPayload: null,
  location: {
    url: "https://loja-demo.com.br/",
    page: { type: "home", data: {} },
    queries: {},
  },
  order: null,
  payment: null,
  session: { id: "session-test" },
  shipping: null,
  store: {
    id: 12345,
    name: "Loja Demo",
    domain: "loja-demo.com.br",
    currency: "BRL",
    language: "pt",
  },
  ui: { slots: {}, values: {} },
};

globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({
    active: true,
    store: { id: "luup-store", slug: "loja-demo" },
    videos: [{ id: "video-1", thumbnail_url: "https://cdn.test/poster.jpg" }],
  }),
});

const nube = {
  api: {},
  clearSlot(slot) {
    rendered.delete(slot);
  },
  getAppSettings() {
    return {};
  },
  getBrowserAPIs() {
    return {
      asyncLocalStorage: {},
      asyncSessionStorage: {},
      navigate() {},
      postMessageToIframe(iframe, message) {
        iframeMessages.push({ iframe, message });
      },
      resetForm() {},
      scrollTo() {},
      submitForm() {},
    };
  },
  getState() {
    return state;
  },
  off() {},
  on(event, listener) {
    listeners.set(event, listener);
  },
  render(slot, component) {
    rendered.set(slot, component);
  },
  send(event, modifier) {
    sent.push({ event, payload: modifier ? modifier(state) : null });
  },
};

const bundle = await readFile(
  new URL("../dist/luup-nuvemshop-partners.js", import.meta.url),
  "utf8",
);
assert.doesNotMatch(bundle, /\b(?:window|document|localStorage|sessionStorage)\b/);
assert.doesNotMatch(bundle, /(?:service_role|supabase-key|data-supabase-key|eyJ[A-Za-z0-9_-]{20,})/);

const { App } = await import("../dist/luup-nuvemshop-partners.js");
App(nube);
await new Promise((resolve) => setTimeout(resolve, 0));

const launcher = rendered.get("corner_bottom_left");
const carousel = rendered.get("before_section_products_sale");
assert.equal(launcher?.type, "iframe");
assert.match(launcher?.src || "", /mode=launcher/);
assert.equal(carousel?.type, "iframe");
assert.match(carousel?.src || "", /mode=carousel/);

launcher.onMessage({
  value: {
    type: "LUPP_NUBESDK_OPEN_FEED",
    videoId: "video-1",
    productUrl: "https://loja-demo.com.br/produtos/demo",
  },
});
await new Promise((resolve) => setTimeout(resolve, 0));

const feed = rendered.get("modal_content");
assert.equal(feed?.type, "iframe");
assert.match(feed?.src || "", /\/s\/loja-demo\/feed\?/);

feed.onMessage({
  value: {
    type: "LUPP_NUVEMSHOP_ADD_TO_CART_REQUEST",
    requestId: "request-1",
    items: [{ product_id: 321, variant_id: 654, quantity: 2 }],
  },
});
assert.deepEqual(sent.at(-1), {
  event: "cart:add",
  payload: {
    cart: {
      items: [{ product_id: 321, variant_id: 654, quantity: 2 }],
    },
  },
});

listeners.get("cart:add:success")?.(state);
assert.deepEqual(iframeMessages.at(-1)?.message, {
  type: "LUPP_NUVEMSHOP_ADD_TO_CART_RESPONSE",
  requestId: "request-1",
  ok: true,
});

console.log("NubeSDK Partners bundle: launcher, carousel, feed and cart OK");

const transitionBundle = await readFile(
  new URL("../dist/luup-nuvemshop-transition.js", import.meta.url),
  "utf8",
);
assert.doesNotMatch(
  transitionBundle,
  /(?:service_role|supabase-key|data-supabase-key|eyJ[A-Za-z0-9_-]{20,})/,
);

function runTransition({ sdkFrame = false } = {}) {
  const appended = [];
  const timers = [];
  const document = {
    body: { appendChild: (node) => appended.push(node) },
    documentElement: { appendChild: (node) => appended.push(node) },
    head: { appendChild: (node) => appended.push(node) },
    createElement() {
      return {
        setAttribute(name, value) {
          this[name] = value;
        },
      };
    },
    querySelector(selector) {
      if (selector.includes("nuvemshop-widget-frame")) {
        return sdkFrame ? {} : null;
      }
      return null;
    },
  };
  const window = {
    setTimeout(callback) {
      timers.push(callback);
      return timers.length;
    },
  };
  vm.runInNewContext(transitionBundle, { document, window });
  timers.forEach((callback) => callback());
  return appended;
}

assert.equal(runTransition({ sdkFrame: true }).length, 0);
const fallbackScripts = runTransition();
assert.equal(fallbackScripts.length, 1);
assert.match(fallbackScripts[0].src || "", /\/nuvemshop-script\.js/);
console.log("Nuvemshop transition: SDK guard and legacy fallback OK");
