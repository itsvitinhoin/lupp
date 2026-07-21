// Lupp widget – embedded home carousel: card rendering plus the anchor
// discovery/watching that decides where the carousel attaches on the page.
import { debugLog, escapeHtml, normalizeText } from "../utils";
import { primeInlineVideos } from "../hls";
import { ctx, isUpzeroStore, videoMediaUrl } from "../context";
import { openFeedOverlay } from "../overlay";
import type { SlimVideo, StorePayload } from "../types";

var homeCarouselRoot: HTMLElement | null = null;

var homeCarouselAnchorObserver: MutationObserver | null = null;

var homeCarouselAnchorRetryTimer: number | null = null;

var homeCarouselAnchorRetryCount = 0;

var homeCarouselAnchorObserverDebounce: number | null = null;

/**
 * Which entrance class a carousel card should render with. Pure so it's
 * unit-testable: whether cards start invisible-until-scrolled
 * (IntersectionObserver-gated) or animate immediately depends only on
 * browser support, not on any DOM state.
 */
export function resolveCarouselCardEntranceClass(
  supportsIntersectionObserver: boolean,
): string {
  return supportsIntersectionObserver
    ? "lupp-home-carousel-card--pending"
    : "lupp-home-carousel-card--entrance";
}

/**
 * How many carousel cards to show for the current viewport. Pure so it's
 * unit-testable without a DOM/matchMedia stub; renderCarousel supplies the
 * live matchMedia result and reruns this on breakpoint-crossing resizes
 * (see watchCarouselViewportBreakpoint in main.ts).
 */
export function resolveCarouselItemLimit(
  isMobileViewport: boolean,
  config: { maxItems: number; mobileMaxItems: number },
): number {
  const configured = isMobileViewport ? config.mobileMaxItems : config.maxItems;
  return Math.max(1, Number(configured) || 1);
}

function isFloatingWidget(): boolean {
  return ctx.widgetType === "floating_launcher" || ctx.widgetType === "floating_video";
}

function closestSection(element: Element): Element {
  var node: Element | null = element;
  while (node && node !== document.body && node !== document.documentElement) {
    if (node.tagName && node.tagName.toLowerCase() === "section") {
      return node;
    }
    node = node.parentNode as Element | null;
  }
  return element;
}

function hasAncestorTag(element: Element | null, tags: string[]): boolean {
  var node: Element | null = element;
  while (node && node !== document.body && node !== document.documentElement) {
    var tagName = node.tagName ? node.tagName.toLowerCase() : "";
    for (var index = 0; index < tags.length; index += 1) {
      if (tagName === tags[index]) return true;
    }
    node = node.parentNode as Element | null;
  }
  return false;
}

function closestHomeBlock(element: Element): Element {
  var main = document.querySelector("main, #MainContent, [role='main']");
  var node: Element | null = element;
  while (node && node !== document.body && node !== document.documentElement) {
    var tagName = node.tagName ? node.tagName.toLowerCase() : "";
    var signature = normalizeText(
      (node.id || "") + " " + (node.className || ""),
    );
    if (
      tagName === "section" ||
      tagName === "article" ||
      tagName === "ul" ||
      tagName === "ol" ||
      (main && node.parentNode === main) ||
      signature.indexOf("vitrine") !== -1 ||
      signature.indexOf("showcase") !== -1 ||
      signature.indexOf("benefit") !== -1 ||
      signature.indexOf("beneficio") !== -1 ||
      signature.indexOf("vantag") !== -1 ||
      signature.indexOf("inform") !== -1 ||
      signature.indexOf("product") !== -1 ||
      signature.indexOf("produto") !== -1 ||
      signature.indexOf("collection") !== -1 ||
      signature.indexOf("shelf") !== -1
    ) {
      return node;
    }
    node = node.parentNode as Element | null;
  }
  return element;
}

function closestShopifySection(element: Element): Element {
  var node: Element | null = element;
  while (node && node !== document.body && node !== document.documentElement) {
    if (
      node.id &&
      /^shopify-section-/i.test(String(node.id)) &&
      node.classList &&
      node.classList.contains("shopify-section")
    ) {
      return node;
    }
    if (node.tagName && node.tagName.toLowerCase() === "section") {
      return node;
    }
    node = node.parentNode as Element | null;
  }
  return element;
}

function findShopifyProductShowcaseSection(): Element | null {
  var primarySelectors = [
    ".product-grid",
    ".card-information__text",
    ".card-wrapper[href*='/products/']",
    ".full-unstyled-link[href*='/products/']",
    ".grid__item [href*='/products/']",
    "[class*='featured-collection']",
    "[class*='featured_collection']",
    "[id*='featured_collection']",
    "[class*='featured_collection'] .grid",
    "[id*='featured_collection'] .grid",
    "[class*='product-grid']",
    "[class*='product-card']",
    "[class*='product-item']",
    "[class*='product__item']",
    "[class*='card-product']",
    "[class*='collection__products']",
    "[class*='collection-products']",
    "[id*='featured-collection']",
    "[id*='featured_collection']",
    "product-card",
    "product-list",
    "quick-view[data-product-url]",
    "product-form",
  ];

  for (var index = 0; index < primarySelectors.length; index += 1) {
    var target = document.querySelector(primarySelectors[index]);
    if (target) return closestShopifySection(target);
  }

  var productLinks = document.querySelectorAll("a[href*='/products/']");
  for (var linkIndex = 0; linkIndex < productLinks.length; linkIndex += 1) {
    var linkSection = closestShopifySection(productLinks[linkIndex]);
    if (linkSection && linkSection !== document.body) return linkSection;
  }

  return null;
}

function findUpzeroProductShowcaseSection(): Element | null {
  var productLinks = document.querySelectorAll("a[href*='/produtos/']");
  for (var linkIndex = 0; linkIndex < productLinks.length; linkIndex += 1) {
    if (hasAncestorTag(productLinks[linkIndex], ["header", "nav", "footer"])) continue;
    var linkBlock = closestHomeBlock(productLinks[linkIndex]);
    if (linkBlock && linkBlock !== document.body && linkBlock !== document.documentElement) {
      return linkBlock;
    }
  }

  var selectors = [
    "[class*='vitrine']",
    "[id*='vitrine']",
    "[class*='showcase']",
    "[id*='showcase']",
    "[class*='shelf']",
    "[id*='shelf']",
    "[class*='collection']",
    "[id*='collection']",
    "[class*='product-list']",
    "[class*='product-grid']",
    "[class*='product-card']",
    "[class*='produto-list']",
    "[class*='produto-grid']",
    "[class*='produto-card']",
  ];

  for (var index = 0; index < selectors.length; index += 1) {
    var target = document.querySelector(selectors[index]);
    if (!target || hasAncestorTag(target, ["header", "nav", "footer"])) continue;
    var block = closestHomeBlock(target);
    var hasProductLink =
      target.matches("a[href*='/produtos/']") ||
      (block && block.querySelector && block.querySelector("a[href*='/produtos/']"));
    if (
      hasProductLink &&
      block &&
      block !== document.body &&
      block !== document.documentElement
    ) {
      return block;
    }
  }

  return null;
}

function findCarouselAnchorBySelector(): Element | null {
  var selector = String(ctx.carouselConfig.anchorSelector || "").trim();
  if (!selector) return null;
  try {
    var target = document.querySelector(selector);
    if (!target) return null;
    return closestShopifySection(target) || target;
  } catch (_) {
    return null;
  }
}

function insertHomeCarouselNear(anchorNode: Element | null): boolean {
  if (!anchorNode || !anchorNode.parentNode) return false;
  var placement = String(ctx.carouselConfig.anchorPlacement || "before").toLowerCase();
  if (placement === "after") {
    anchorNode.parentNode.insertBefore(homeCarouselRoot!, anchorNode.nextSibling);
  } else {
    anchorNode.parentNode.insertBefore(homeCarouselRoot!, anchorNode);
  }
  return true;
}

function findHomeCarouselBeforeNode(): Element | null {
  var headingTarget = normalizeText(ctx.carouselConfig.beforeHeading);
  var headings = document.querySelectorAll("h1,h2,h3,h4");
  for (var index = 0; index < headings.length; index += 1) {
    var heading = headings[index];
    var text = normalizeText(heading.textContent);
    if (headingTarget && text === headingTarget) {
      return closestSection(heading);
    }
  }

  for (var fallbackIndex = 0; fallbackIndex < headings.length; fallbackIndex += 1) {
    var fallbackHeading = headings[fallbackIndex];
    var fallbackText = normalizeText(fallbackHeading.textContent);
    if (fallbackText.indexOf("com capa") !== -1) {
      return closestSection(fallbackHeading);
    }
  }

  return null;
}

/**
 * Scores how likely a normalized text blob is to be a Brazilian storefront's
 * "shipping/payment benefits" strip (free shipping, installments, Pix,
 * etc.) — pure so the keyword heuristic is unit-testable without seeding a
 * live DOM tree of candidate sections.
 */
export function scoreBenefitsSectionText(text: string): number {
  var score = 0;
  if (
    text.indexOf("entrega") !== -1 ||
    text.indexOf("frete") !== -1 ||
    text.indexOf("envio") !== -1
  ) {
    score += 1;
  }
  if (
    text.indexOf("exclusivo") !== -1 ||
    text.indexOf("pedido") !== -1 ||
    text.indexOf("mínimo") !== -1 ||
    text.indexOf("minimo") !== -1
  ) {
    score += 1;
  }
  if (
    text.indexOf("pagamento") !== -1 ||
    text.indexOf("parcela") !== -1 ||
    text.indexOf("cartão") !== -1 ||
    text.indexOf("cartao") !== -1
  ) {
    score += 1;
  }
  if (text.indexOf("pix") !== -1) score += 1;
  return score;
}

export var HOME_BENEFITS_SECTION_MIN_SCORE = 3;

function findHomeBenefitsSection(): Element | null {
  var candidates: Element[] = [];
  var seen: Element[] = [];
  var selectors = [
    "section",
    "main > div",
    "main > ul",
    "main > nav",
    "[class]",
    "[id]",
  ];

  function addCandidate(candidate: Element | null) {
    if (!candidate || candidate === document.body || candidate === document.documentElement) {
      return;
    }
    if (seen.indexOf(candidate) !== -1) return;
    seen.push(candidate);
    candidates.push(candidate);
  }

  for (var selectorIndex = 0; selectorIndex < selectors.length; selectorIndex += 1) {
    var nodes = document.querySelectorAll(selectors[selectorIndex]);
    for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
      addCandidate(nodes[nodeIndex]);
    }
  }

  for (var index = 0; index < candidates.length; index += 1) {
    var candidate = candidates[index];
    if (hasAncestorTag(candidate, ["header", "nav", "footer"])) continue;
    var text = normalizeText(candidate.textContent);
    if (text.length < 12 || text.length > 1500) continue;

    if (scoreBenefitsSectionText(text) >= HOME_BENEFITS_SECTION_MIN_SCORE) {
      return closestHomeBlock(candidate);
    }
  }
  return null;
}

function ensureHomeCarouselRoot(): HTMLElement | null {
  if (!homeCarouselRoot) {
    // A duplicate embed <script> tag runs its own independent module
    // instance with its own module-level homeCarouselRoot, so this guard
    // (module-scoped) can't see a root a different instance created — check
    // the live DOM instead, and never inject a second carousel next to it.
    if (document.querySelector('[data-lupp-widget-root="home_carousel"]')) {
      return null;
    }
    homeCarouselRoot = document.createElement("div");
    homeCarouselRoot.setAttribute("data-lupp-widget-root", "home_carousel");
    homeCarouselRoot.setAttribute("data-lupp-injected", "true");
  }

  var configuredAnchor = findCarouselAnchorBySelector();
  if (insertHomeCarouselNear(configuredAnchor)) {
    return homeCarouselRoot;
  }

  if (isUpzeroStore(ctx.sharedState.activeStore)) {
    var upzeroBenefitsSection = findHomeBenefitsSection();
    if (upzeroBenefitsSection && upzeroBenefitsSection.parentNode) {
      upzeroBenefitsSection.parentNode.insertBefore(
        homeCarouselRoot,
        upzeroBenefitsSection.nextSibling,
      );
      return homeCarouselRoot;
    }

    var upzeroBeforeNode = findHomeCarouselBeforeNode();
    if (upzeroBeforeNode && upzeroBeforeNode.parentNode) {
      upzeroBeforeNode.parentNode.insertBefore(homeCarouselRoot, upzeroBeforeNode);
      return homeCarouselRoot;
    }

    var upzeroProductShowcaseSection = findUpzeroProductShowcaseSection();
    if (upzeroProductShowcaseSection && upzeroProductShowcaseSection.parentNode) {
      upzeroProductShowcaseSection.parentNode.insertBefore(
        homeCarouselRoot,
        upzeroProductShowcaseSection,
      );
      return homeCarouselRoot;
    }
  } else {
    var beforeNode = findHomeCarouselBeforeNode();
    if (beforeNode && beforeNode.parentNode) {
      beforeNode.parentNode.insertBefore(homeCarouselRoot, beforeNode);
      return homeCarouselRoot;
    }

    var benefitsSection = findHomeBenefitsSection();
    if (benefitsSection && benefitsSection.parentNode) {
      benefitsSection.parentNode.insertBefore(
        homeCarouselRoot,
        benefitsSection.nextSibling,
      );
      return homeCarouselRoot;
    }

    var productShowcaseSection = findShopifyProductShowcaseSection();
    if (productShowcaseSection && productShowcaseSection.parentNode) {
      productShowcaseSection.parentNode.insertBefore(
        homeCarouselRoot,
        productShowcaseSection,
      );
      return homeCarouselRoot;
    }
  }

  var main = document.querySelector("main, #MainContent, [role='main']");
  if (main) {
    main.insertBefore(homeCarouselRoot, main.firstChild || null);
    return homeCarouselRoot;
  }

  return null;
}

export function removeHomeCarouselRoot(): void {
  if (homeCarouselRoot && homeCarouselRoot.parentNode) {
    homeCarouselRoot.parentNode.removeChild(homeCarouselRoot);
  }
}

function hasHomeCarouselAnchor(): boolean {
  return Boolean(
    findCarouselAnchorBySelector() ||
      findHomeCarouselBeforeNode() ||
      findHomeBenefitsSection() ||
      (isUpzeroStore(ctx.sharedState.activeStore) ? findUpzeroProductShowcaseSection() : null) ||
      findShopifyProductShowcaseSection() ||
      document.querySelector("main, #MainContent, [role='main']"),
  );
}

function clearHomeCarouselAnchorWatch(): void {
  if (homeCarouselAnchorObserver) {
    homeCarouselAnchorObserver.disconnect();
    homeCarouselAnchorObserver = null;
  }
  if (homeCarouselAnchorRetryTimer) {
    window.clearTimeout(homeCarouselAnchorRetryTimer);
    homeCarouselAnchorRetryTimer = null;
  }
  if (homeCarouselAnchorObserverDebounce) {
    window.clearTimeout(homeCarouselAnchorObserverDebounce);
    homeCarouselAnchorObserverDebounce = null;
  }
}

function scheduleHomeCarouselAnchorRetry(root: HTMLElement): void {
  if (!root || !shouldRenderEmbeddedHomeCarousel()) return;
  if (homeCarouselAnchorRetryTimer || homeCarouselAnchorObserver) return;

  if ("MutationObserver" in window && document.body) {
    homeCarouselAnchorObserver = new MutationObserver(function () {
      // Storefront hydration/animation churn can fire dozens of mutation
      // batches per second; hasHomeCarouselAnchor() runs several
      // full-document querySelectorAll scans, so coalesce bursts into a
      // single check instead of running it on every batch.
      if (homeCarouselAnchorObserverDebounce) return;
      homeCarouselAnchorObserverDebounce = window.setTimeout(function () {
        homeCarouselAnchorObserverDebounce = null;
        // The observer (and this deferred check) can fire during page
        // teardown, when the document is already being destroyed.
        if (!document || !document.body) return;
        if (!hasHomeCarouselAnchor()) return;
        clearHomeCarouselAnchorWatch();
        homeCarouselAnchorRetryCount = 0;
        ctx.renderForCurrentUrl(root);
      }, 150);
    });
    homeCarouselAnchorObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  if (homeCarouselAnchorRetryCount >= 12) return;
  homeCarouselAnchorRetryCount += 1;
  homeCarouselAnchorRetryTimer = window.setTimeout(function () {
    homeCarouselAnchorRetryTimer = null;
    if (hasHomeCarouselAnchor()) {
      clearHomeCarouselAnchorWatch();
      homeCarouselAnchorRetryCount = 0;
    }
    ctx.renderForCurrentUrl(root);
  }, Math.min(1600, 250 + homeCarouselAnchorRetryCount * 180));
}

// Page scoping is server-evaluated: display.show_home_carousel is true only
// on the storefront home with the home experience on and the carousel
// plan-allowed, per the current context URL.
function shouldRenderEmbeddedHomeCarousel(): boolean {
  return isFloatingWidget() && ctx.contextDisplay.show_home_carousel === true;
}

export function renderEmbeddedHomeCarousel(videos: SlimVideo[], root: HTMLElement): void {
  if (!shouldRenderEmbeddedHomeCarousel()) {
    clearHomeCarouselAnchorWatch();
    removeHomeCarouselRoot();
    return;
  }

  if (!videos.length) {
    removeHomeCarouselRoot();
    return;
  }

  var carouselRoot = ensureHomeCarouselRoot();
  if (!carouselRoot) {
    removeHomeCarouselRoot();
    scheduleHomeCarouselAnchorRetry(root);
    return;
  }

  clearHomeCarouselAnchorWatch();
  homeCarouselAnchorRetryCount = 0;
  renderCarousel(carouselRoot, ctx.sharedState.activeStore as StorePayload, videos);
}

// Cards render invisible (--pending) so the stagger fade-in only plays once
// the carousel actually scrolls into view — previously it played unseen for
// any anchor placed further down the page, since the CSS animation started
// immediately at insertion time regardless of visibility.
var CAROUSEL_ENTRANCE_TRIGGERED_ATTR = "data-lupp-carousel-entrance-triggered";

function triggerCarouselEntranceWhenVisible(root: HTMLElement): void {
  // renderCarousel re-renders the same root (breakpoint resize, Upzero
  // status refresh) — once the reveal has played this session, later
  // re-renders render their cards already-visible (see
  // resolveCarouselCardEntranceClass's caller) instead of re-arming an
  // observer that would just replay the fade every time.
  if (root.getAttribute(CAROUSEL_ENTRANCE_TRIGGERED_ATTR) === "true") return;
  if (!("IntersectionObserver" in window)) return;
  var section = root.querySelector(".lupp-home-carousel");
  if (!section) return;

  var observer = new IntersectionObserver(
    function (entries) {
      var isVisible = entries.some(function (entry) {
        return entry.isIntersecting;
      });
      if (!isVisible) return;
      observer.disconnect();
      root.setAttribute(CAROUSEL_ENTRANCE_TRIGGERED_ATTR, "true");
      var pendingCards = section!.querySelectorAll(
        ".lupp-home-carousel-card--pending",
      );
      for (var index = 0; index < pendingCards.length; index += 1) {
        pendingCards[index].classList.remove("lupp-home-carousel-card--pending");
        pendingCards[index].classList.add("lupp-home-carousel-card--entrance");
      }
    },
    { threshold: 0.15 },
  );
  observer.observe(section);
}

export function renderCarousel(
  root: HTMLElement,
  store: StorePayload,
  videos: SlimVideo[],
): void {
  var accent = ctx.launcherConfig.accentColor || store.button_color || "#006BFF";
  var isMobileViewport =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 640px)").matches;
  var items = videos.slice(
    0,
    resolveCarouselItemLimit(isMobileViewport, ctx.carouselConfig),
  );
  var supportsCarouselEntranceObserver =
    root.getAttribute(CAROUSEL_ENTRANCE_TRIGGERED_ATTR) !== "true" &&
    "IntersectionObserver" in window;
  var upzeroCustomerStatus = isUpzeroStore(store)
    ? ctx.sharedState.upzeroCustomerStatusCache
    : { approved: true, loggedIn: true };
  var descriptionHtml = ctx.carouselConfig.description
    ? '<p class="lupp-home-carousel-description">' +
      escapeHtml(ctx.carouselConfig.description) +
      "</p>"
    : "";

  function productCardHtml(video: SlimVideo): string {
    // Slim server product: name/image fallback chains and pt-BR price
    // formatting are already resolved server-side.
    var product = video.product || null;
    var imageUrl = (product && product.image_url) || "";
    var name = (product && product.name) || "";
    var restricted =
      isUpzeroStore(store) &&
      !(upzeroCustomerStatus && upzeroCustomerStatus.approved);
    var price = restricted ? "" : (product && product.price_label) || "";
    var subtitle = restricted
      ? "Entre ou cadastre-se para visualizar valores."
      : price || "Disponível para compra.";
    var actionLabel = isUpzeroStore(store)
      ? restricted
        ? upzeroCustomerStatus && upzeroCustomerStatus.loggedIn
          ? "Aguardando aprovação"
          : "Cadastre-se para ver o preço"
        : "Comprar"
      : "Comprar";

    return (
      '<span class="lupp-home-carousel-product">' +
      '<span class="lupp-home-carousel-product-main">' +
      (imageUrl
        ? '<img class="lupp-home-carousel-product-image" src="' +
          escapeHtml(imageUrl) +
          '" alt="" loading="lazy" decoding="async">'
        : '<span class="lupp-home-carousel-product-image lupp-home-carousel-product-placeholder" aria-hidden="true"></span>') +
      '<span class="lupp-home-carousel-product-copy">' +
      '<span class="lupp-home-carousel-product-name">' +
      escapeHtml(name) +
      "</span>" +
      '<span class="lupp-home-carousel-product-price">' +
      escapeHtml(subtitle) +
      "</span>" +
      "</span></span>" +
      '<span class="lupp-home-carousel-product-divider"></span>' +
      '<span class="lupp-home-carousel-product-cta">' +
      escapeHtml(actionLabel) +
      "</span></span>"
    );
  }

  root.innerHTML =
    '<section class="lupp-home-carousel" aria-label="' +
    escapeHtml(ctx.carouselConfig.title) +
    '">' +
    "<style>" +
    ".lupp-home-carousel{font-family:" +
    ctx.launcherConfig.fontFamily +
    ";box-sizing:border-box;position:relative;width:100%;max-width:100vw;padding:24px 0 30px;background:#fff;color:#16171a;overflow:hidden}" +
    ".lupp-home-carousel *{box-sizing:border-box}" +
    ".lupp-home-carousel-title{margin:0 16px 22px;text-align:center;font-size:clamp(18px,2vw,29px);font-weight:500;letter-spacing:0;line-height:1.2;color:#202124}" +
    ".lupp-home-carousel-description{max-width:680px;margin:-12px auto 22px;padding:0 16px;text-align:center;color:#64748b;font-size:14px;font-weight:600;line-height:1.5;letter-spacing:0}" +
    ".lupp-home-carousel-track{display:flex;gap:clamp(18px,2.5vw,48px);overflow-x:auto;overflow-y:hidden;scroll-snap-type:x proximity;padding:4px max(16px,calc((100vw - 1240px)/2)) 10px;-webkit-overflow-scrolling:touch;scrollbar-width:none}" +
    ".lupp-home-carousel-track::-webkit-scrollbar{display:none}" +
    ".lupp-home-carousel-track:focus-visible{outline:2px solid " +
    accent +
    ";outline-offset:-2px}" +
    // Subtle edge fade hints there's more to scroll horizontally — the
    // classic "content continues" affordance for an overflow-x list with no
    // visible scrollbar.
    ".lupp-home-carousel-edge-fade{position:absolute;top:24px;bottom:30px;width:32px;pointer-events:none;z-index:1}" +
    ".lupp-home-carousel-edge-fade--left{left:0;background:linear-gradient(to right,#fff,rgba(255,255,255,0))}" +
    ".lupp-home-carousel-edge-fade--right{right:0;background:linear-gradient(to left,#fff,rgba(255,255,255,0))}" +
    ".lupp-home-carousel-card{position:relative;display:block;flex:0 0 clamp(178px,14.2vw,250px);aspect-ratio:9/16;border:0;border-radius:12px;background:#f3f4f6;box-shadow:0 14px 28px rgba(15,23,42,.12);overflow:hidden;cursor:pointer;scroll-snap-align:center;padding:0;color:inherit}" +
    ".lupp-home-carousel-card:focus-visible{outline:3px solid " +
    accent +
    ";outline-offset:2px}" +
    ".lupp-home-carousel-card--pending{opacity:0}" +
    ".lupp-home-carousel-card--entrance{opacity:0;animation:lupp-home-carousel-card-in .38s ease-out forwards;animation-delay:calc(var(--lupp-card-index, 0) * 45ms)}" +
    "@keyframes lupp-home-carousel-card-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}" +
    "@media (prefers-reduced-motion: reduce){.lupp-home-carousel-card--entrance{animation-duration:.001s;animation-delay:0s}}" +
    ".lupp-home-carousel-card:nth-child(4n){flex-basis:clamp(190px,15.5vw,270px)}" +
    ".lupp-home-carousel-thumb{width:100%;height:100%;display:block;object-fit:cover;background:#e5e7eb;transition:transform .28s ease}" +
    ".lupp-home-carousel-card:hover .lupp-home-carousel-thumb{transform:scale(1.025)}" +
    ".lupp-home-carousel-product{position:absolute;left:8px;right:8px;bottom:9px;display:flex;flex-direction:column;align-items:stretch;gap:0;min-height:78px;padding:0;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(72,82,72,.82);box-shadow:0 10px 24px rgba(15,23,42,.2);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);text-align:left;overflow:hidden}" +
    ".lupp-home-carousel-product-main{display:flex;align-items:center;gap:7px;min-width:0;padding:7px 8px}" +
    ".lupp-home-carousel-product-image{display:block;flex:0 0 42px;width:42px;height:42px;border-radius:8px;object-fit:cover;background:#eef2f7;border:1px solid rgba(255,255,255,.22)}" +
    ".lupp-home-carousel-product-placeholder{background:" +
    accent +
    "}" +
    ".lupp-home-carousel-product-copy{min-width:0;display:block;flex:1;color:#fff}" +
    ".lupp-home-carousel-product-name{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#fff;font-size:12px;font-weight:700;line-height:1.15;letter-spacing:0;text-transform:uppercase}" +
    ".lupp-home-carousel-product-price{display:block;margin-top:4px;color:rgba(255,255,255,.84);font-size:11px;font-weight:600;line-height:1.2;letter-spacing:0}" +
    ".lupp-home-carousel-product-divider{display:block;height:1px;background:rgba(255,255,255,.14)}" +
    ".lupp-home-carousel-product-cta{margin:7px 8px 8px;display:flex;align-items:center;justify-content:center;min-height:32px;border-radius:10px;background:#fff;color:#070d1d;border:2px solid " +
    accent +
    ";padding:7px 9px;text-align:center;font-size:11px;font-weight:800;line-height:1.1;letter-spacing:0}" +
    "@media(max-width:640px){.lupp-home-carousel{padding:20px 0 24px}.lupp-home-carousel-track{gap:14px;padding-left:14px;padding-right:14px}.lupp-home-carousel-card{flex-basis:62vw}.lupp-home-carousel-card:nth-child(4n){flex-basis:66vw}.lupp-home-carousel-product{min-height:82px}.lupp-home-carousel-product-name{font-size:12px}.lupp-home-carousel-product-price{font-size:10.5px}.lupp-home-carousel-product-cta{min-height:31px;font-size:11px}}" +
    "</style>" +
    '<h2 class="lupp-home-carousel-title">' +
    escapeHtml(ctx.carouselConfig.title) +
    "</h2>" +
    descriptionHtml +
    '<div class="lupp-home-carousel-edge-fade lupp-home-carousel-edge-fade--left" aria-hidden="true"></div>' +
    '<div class="lupp-home-carousel-edge-fade lupp-home-carousel-edge-fade--right" aria-hidden="true"></div>' +
    '<div class="lupp-home-carousel-track" role="region" aria-label="' +
    escapeHtml(ctx.carouselConfig.title) +
    '" tabindex="0">' +
    items
      .map(function (video, index) {
        var thumbnailUrl = video.thumbnail_url || "";
        var mediaUrl = videoMediaUrl(video);
        return (
          '<button type="button" class="lupp-home-carousel-card ' +
          resolveCarouselCardEntranceClass(supportsCarouselEntranceObserver) +
          '" style="--lupp-card-index:' +
          index +
          '" data-video="' +
          video.id +
          '" aria-label="Abrir vídeo ' +
          escapeHtml(video.title || "Luup") +
          '">' +
          (mediaUrl
            ? '<video class="lupp-home-carousel-thumb" muted playsinline loop autoplay preload="metadata" data-lupp-video-quality="preview" data-lupp-video-src="' +
              escapeHtml(mediaUrl) +
              '" poster="' +
              escapeHtml(thumbnailUrl) +
              '"></video>'
            : thumbnailUrl
            ? '<img class="lupp-home-carousel-thumb" src="' +
              escapeHtml(thumbnailUrl) +
              '" alt="" loading="lazy" decoding="async">'
            : '<span class="lupp-home-carousel-thumb" aria-hidden="true"></span>') +
          productCardHtml(video) +
          "</button>"
        );
      })
      .join("") +
    "</div></section>";

  primeInlineVideos(root);
  triggerCarouselEntranceWhenVisible(root);

  root.onclick = function (event) {
    var target = event.target as HTMLElement | null;
    if (target && target.nodeType === 3) target = target.parentElement;
    var button = target && target.closest ? target.closest("[data-video]") : null;
    if (!button) return;
    var videoId = button.getAttribute("data-video");
    var fallbackVideo = null;
    for (var index = 0; index < items.length; index += 1) {
      if (String(items[index].id) === String(videoId)) {
        fallbackVideo = items[index];
        break;
      }
    }
    if (store && store.id) {
      ctx.track(store.id, "home_carousel_click", videoId, null, {
        source: "home_carousel_click",
      });
    }
    var linkedProduct =
      fallbackVideo && fallbackVideo.product ? fallbackVideo.product : null;
    var linkedProductUrl =
      linkedProduct && linkedProduct.product_url
        ? isUpzeroStore(store)
          ? ctx.repairUpzeroProductUrl(linkedProduct, linkedProduct.product_url, store)
          : linkedProduct.product_url
        : "";
    openFeedOverlay(store, videoId, fallbackVideo, linkedProductUrl);
  };

  if (
    isUpzeroStore(store) &&
    (!ctx.sharedState.upzeroCustomerStatusCache ||
      Date.now() - ctx.sharedState.upzeroCustomerStatusLastRefreshAt > 2500)
  ) {
    var statusKeyBeforeRefresh = ctx.sharedState.upzeroCustomerStatusCache
      ? String(ctx.sharedState.upzeroCustomerStatusCache.status) +
        ":" +
        String(ctx.sharedState.upzeroCustomerStatusCache.approved)
      : "";
    ctx.detectCustomerStatus(store, { forceRefresh: true })
      .then(function () {
        var statusKeyAfterRefresh = ctx.sharedState.upzeroCustomerStatusCache
          ? String(ctx.sharedState.upzeroCustomerStatusCache.status) +
            ":" +
            String(ctx.sharedState.upzeroCustomerStatusCache.approved)
          : "";
        // Only re-render on an actual status change; re-rendering
        // unconditionally loops forever for logged-out visitors.
        if (statusKeyAfterRefresh === statusKeyBeforeRefresh) return;
        if (root && root.parentNode) renderCarousel(root, store, videos);
      })
      .catch(function (error: unknown) {
        debugLog("carousel: upzero status refresh failed", error);
      });
  }
}
