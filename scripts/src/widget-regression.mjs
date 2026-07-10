// Regression harness for the storefront widget delivery chain (issue #2).
// Simulates real merchant pages in jsdom with a mocked bootstrap endpoint —
// no network and no dev server required.
//
// Run: pnpm --filter @workspace/scripts run test:widget
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const widgetSource = readFileSync(
  path.join(repoRoot, "artifacts/lupp/public/widget.js"),
  "utf8",
);
const loaderSource = readFileSync(
  path.join(repoRoot, "artifacts/lupp/public/nuvemshop-script.js"),
  "utf8",
);

let failures = 0;
function check(label, condition) {
  const status = condition ? "ok " : "FAIL";
  console.log(`  [${status}] ${label}`);
  if (!condition) failures += 1;
}

function makeWindow({ html, url }) {
  const dom = new JSDOM(html, {
    url,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.__LUUP_DEBUG__ = false;
  window.matchMedia ||= () => ({
    matches: false,
    addListener() {},
    removeListener() {},
  });
  window.IntersectionObserver ||= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  if (!window.crypto?.randomUUID) {
    const crypto = window.crypto || {};
    crypto.randomUUID = () => "00000000-0000-4000-8000-000000000000";
    window.crypto = crypto;
  }
  return window;
}

function runAs(window, scriptEl, source) {
  Object.defineProperty(window.document, "currentScript", {
    get: () => scriptEl,
    configurable: true,
  });
  window.eval(source);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const DEMO_VIDEO = {
  id: "v1",
  title: "Video",
  video_url: "https://cdn.example.com/v.mp4",
  thumbnail_url: "https://cdn.example.com/v.jpg",
  is_feed_enabled: true,
  is_product_page_enabled: true,
  video_products: [],
};

function bootstrapPayload({ carouselEnabled = true, mode, videoCount = 3 }) {
  return {
    active: true,
    mode,
    resolved_by: "integration_domain",
    store: {
      id: "store-1",
      slug: "demo",
      button_color: "#006BFF",
      status: "active",
      platform: "nuvemshop",
      url: "https://demo.com.br",
      plan_id: "growth",
    },
    videos:
      mode === "meta"
        ? []
        : Array.from({ length: videoCount }, (_, index) => ({
            ...DEMO_VIDEO,
            id: `v${index}`,
          })),
    widget: {
      id: "widget-1",
      type: "floating_video",
      status: "active",
      settings: {
        display: { mode: "all" },
        carousel: {
          enabled: carouselEnabled,
          title: "Do banco",
          max_items: 12,
          mobile_max_items: 6,
        },
      },
    },
  };
}

function mockBootstrapFetch(window, { matchDomain }) {
  window.fetch = (url) => {
    const parsed = new URL(String(url));
    if (!parsed.pathname.includes("lupp-widget-bootstrap")) {
      return Promise.resolve(new Response("{}", { status: 200 }));
    }
    const domain = parsed.searchParams.get("store_domain") || "";
    const mode = parsed.searchParams.get("mode") || "feed";
    if (matchDomain && !domain.includes(matchDomain)) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            active: false,
            error: "store_not_found",
            tried: ["store_domain"],
          }),
          { status: 404 },
        ),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify(bootstrapPayload({ mode })), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };
}

const NUVEMSHOP_PAGE = {
  // Non-numeric subdomain, no window.LS, loader injected with NO query
  // params — the worst-case auto-install scenario from issue #2.
  html: `<!doctype html><html><body>
    <script id="loader" src="https://www.playluup.com.br/nuvemshop-script.js"></script>
    </body></html>`,
  url: "https://lojadevteste4.lojavirtualnuvem.com.br/",
};

async function scenarioNuvemshopRendersByDomain() {
  console.log("scenario: Nuvemshop loader resolves by domain and renders");
  const window = makeWindow(NUVEMSHOP_PAGE);
  mockBootstrapFetch(window, {
    matchDomain: "lojadevteste4.lojavirtualnuvem.com.br",
  });

  runAs(window, window.document.getElementById("loader"), loaderSource);
  await sleep(3500);

  const injected = window.document.querySelector(
    "script[data-lupp-nuvemshop-widget]",
  );
  check("loader injected widget.js", Boolean(injected));
  check(
    "injected tag carries the store domain",
    injected?.getAttribute("data-store-domain") ===
      "lojadevteste4.lojavirtualnuvem.com.br",
  );
  check(
    "injected tag exposes NO supabase key",
    !injected?.getAttribute("data-supabase-key"),
  );

  runAs(window, injected, widgetSource);
  await sleep(2500);

  check(
    "floating launcher rendered",
    Boolean(window.document.querySelector("[data-lupp-launcher]")),
  );
  await sleep(700);
  check(
    "light launcher removed after render",
    !window.document.getElementById("lupp-nuvemshop-light-launcher"),
  );
  window.close();
}

async function scenarioUnknownStoreCleansUp() {
  console.log("scenario: unknown store aborts and removes the light launcher");
  const window = makeWindow({
    ...NUVEMSHOP_PAGE,
    url: "https://unknown-store.lojavirtualnuvem.com.br/",
  });
  mockBootstrapFetch(window, {
    matchDomain: "lojadevteste4.lojavirtualnuvem.com.br",
  });

  runAs(window, window.document.getElementById("loader"), loaderSource);
  await sleep(3500);
  const injected = window.document.querySelector(
    "script[data-lupp-nuvemshop-widget]",
  );
  check("loader injected widget.js", Boolean(injected));

  runAs(window, injected, widgetSource);
  await sleep(2500);

  check(
    "no widget root rendered",
    window.document.querySelectorAll("[data-lupp-widget-root]").length === 0 ||
      [...window.document.querySelectorAll("[data-lupp-widget-root]")].every(
        (root) => root.innerHTML.length === 0,
      ),
  );
  check(
    "light launcher removed after abort",
    !window.document.getElementById("lupp-nuvemshop-light-launcher"),
  );
  window.close();
}

async function scenarioCarouselFollowsDbConfig() {
  console.log("scenario: carousel enablement follows settings.carousel");
  for (const enabled of [true, false]) {
    const window = makeWindow({
      html: `<!doctype html><html><body><main>
        <script id="w" data-store="demo" data-widget="carousel"
          data-supabase-url="https://example.supabase.co"
          data-lupp-url="https://www.playluup.com.br"></script>
        </main></body></html>`,
      url: "https://demo.com.br/",
    });
    window.fetch = (url) => {
      const mode = new URL(String(url)).searchParams.get("mode") || "feed";
      return Promise.resolve(
        new Response(
          JSON.stringify(bootstrapPayload({ carouselEnabled: enabled, mode })),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    };
    runAs(window, window.document.getElementById("w"), widgetSource);
    await sleep(2200);

    const cards = window.document.querySelectorAll(
      ".lupp-home-carousel-product",
    ).length;
    check(
      `DB carousel.enabled=${enabled} → ${enabled ? "renders cards" : "renders nothing"}`,
      enabled ? cards > 0 : cards === 0,
    );
    window.close();
  }
}

await scenarioNuvemshopRendersByDomain();
await scenarioUnknownStoreCleansUp();
await scenarioCarouselFollowsDbConfig();

if (failures) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exitCode = 1;
} else {
  console.log("\nall widget regression checks passed");
}
