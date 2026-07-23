// Lupp widget – feed overlay (fullscreen iframe + feedback form) and the
// postMessage plumbing shared with the feed iframe and platform adapters.
import {
  getUrlHostname,
  getUrlOrigin,
  resolveUrl,
  sameStorefrontHostname,
} from "./utils";
import { ctx, isUpzeroStore, videoMediaUrl } from "./context";
import type { CustomerStatus, SlimVideo, StorePayload } from "./types";

var OVERLAY_TRANSITION_MS = 220;

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

var preconnectedOrigin: string | null = null;

// Warms DNS/TLS for the feed's origin as soon as the widget knows it (right
// after bootstrap resolves), so the overlay iframe's first navigation on
// click doesn't pay that cost cold. Safe to call repeatedly — it's a no-op
// once the same origin has already been hinted.
export function preconnectFeedOrigin(luppBaseUrl: string): void {
  try {
    var origin = getUrlOrigin(luppBaseUrl);
    if (!origin || origin === preconnectedOrigin) return;
    preconnectedOrigin = origin;

    (["preconnect", "dns-prefetch"] as const).forEach(function (rel) {
      var link = document.createElement("link");
      link.rel = rel;
      link.href = origin;
      if (rel === "preconnect") link.crossOrigin = "anonymous";
      document.head.appendChild(link);
    });
  } catch (_) {}
}

export function isTrustedLuppFrameOrigin(origin: string): boolean {
  try {
    var normalizedOrigin = getUrlOrigin(origin);
    var configuredOrigin = getUrlOrigin(resolveUrl(ctx.luppBaseUrl, window.location.href));
    var scriptOrigin = getUrlOrigin(ctx.script.src || "");
    if (normalizedOrigin === configuredOrigin || normalizedOrigin === scriptOrigin) {
      return true;
    }
    var hostname = getUrlHostname(normalizedOrigin);
    return (
      sameStorefrontHostname(hostname, "luup.dzns.com.br") ||
      sameStorefrontHostname(hostname, "playluup.com.br") ||
      sameStorefrontHostname(hostname, "www.playluup.com.br") ||
      /(^|\.)vercel\.app$/i.test(hostname)
    );
  } catch (_) {
    return false;
  }
}

export function postUpzeroCustomerStatus(
  target: MessageEventSource | null,
  origin: string,
  status: CustomerStatus,
): void {
  if (!target || typeof target.postMessage !== "function") return;
  (target as Window).postMessage(
    {
      type: "LUPP_UPZERO_CUSTOMER_STATUS_RESPONSE",
      approved: Boolean(status.approved),
      loggedIn: Boolean(status.loggedIn),
      source: status.source || "unknown",
      status: status.status || "UNKNOWN",
    },
    origin,
  );
}

// Shared responder for the feed iframe's request/response postMessage
// pairs (cart + product lookups): every response carries the same
// requestId/ok/error envelope; extra fields (product) ride along when the
// payload provides them.
export function postFrameResponse(
  target: MessageEventSource | Window | null,
  origin: string,
  type: string,
  requestId: unknown,
  payload: { ok?: boolean; error?: unknown; product?: unknown },
): void {
  if (!target || typeof target.postMessage !== "function") return;
  var message: Record<string, unknown> = {
    type: type,
    requestId: requestId,
    ok: Boolean(payload && payload.ok),
    error: payload && payload.error ? String(payload.error) : "",
  };
  if (payload && "product" in payload) {
    message.product = payload.product || null;
  }
  (target as Window).postMessage(message, origin);
}

function previewVideoFor(
  videoId: string | null | undefined,
  fallbackVideo?: Partial<SlimVideo> | null,
): Partial<SlimVideo> | null {
  if (
    fallbackVideo &&
    (fallbackVideo.media_url || fallbackVideo.thumbnail_url)
  )
    return fallbackVideo;
  if (!videoId) return ctx.activeVideos[0] || null;
  for (var index = 0; index < ctx.activeVideos.length; index += 1) {
    if (String(ctx.activeVideos[index].id) === String(videoId))
      return ctx.activeVideos[index];
  }
  return ctx.activeVideos[0] || null;
}

export function openFeedOverlay(
  store: StorePayload,
  videoId?: string | null,
  fallbackVideo?: Partial<SlimVideo> | null,
  productUrlOverride?: string,
): void {
  if (ctx.nubesdkFrameMode) {
    var framePreviewVideo = previewVideoFor(videoId, fallbackVideo);
    try {
      window.parent.postMessage(
        {
          type: "LUPP_NUBESDK_OPEN_FEED",
          videoId: videoId || "",
          productUrl: productUrlOverride || ctx.currentProductUrl(),
          previewVideoUrl: framePreviewVideo
            ? videoMediaUrl(framePreviewVideo)
            : "",
          previewPosterUrl:
            framePreviewVideo && framePreviewVideo.thumbnail_url
              ? framePreviewVideo.thumbnail_url
              : "",
        },
        "*",
      );
      if (store && store.id) {
        ctx.track(store.id, "feed_open", videoId || null, null, {
          opened_from: "nubesdk_frame",
        });
      }
    } catch (_) {}
    return;
  }

  var existing = document.querySelector("[data-lupp-feed-overlay]");
  if (existing) existing.remove();

  var previousOverflow = document.body.style.overflow;
  var openedAt = Date.now();
  var closeTracked = false;
  document.body.style.overflow = "hidden";

  var reduceMotion = prefersReducedMotion();
  var transitionStyle = reduceMotion
    ? ""
    : "transition:opacity " + OVERLAY_TRANSITION_MS + "ms ease-out;";
  var frameTransitionStyle = reduceMotion
    ? ""
    : "transition:opacity " +
      OVERLAY_TRANSITION_MS +
      "ms ease-out,transform " +
      OVERLAY_TRANSITION_MS +
      "ms cubic-bezier(.2,.9,.3,1);";

  var previouslyFocusedElement = document.activeElement as HTMLElement | null;

  var overlay = document.createElement("div");
  overlay.setAttribute("data-lupp-feed-overlay", "true");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Feed Luup");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.76);display:flex;align-items:center;justify-content:center;font-family:" +
    ctx.launcherConfig.fontFamily +
    ";opacity:" +
    (reduceMotion ? "1" : "0") +
    ";" +
    transitionStyle;

  var close = document.createElement("button");
  close.type = "button";
  close.setAttribute("aria-label", "Fechar feed Luup");
  close.style.cssText =
    "position:absolute;right:16px;top:16px;width:42px;height:42px;border:0;border-radius:999px;background:rgba(255,255,255,.14);color:#fff;font-size:28px;line-height:1;cursor:pointer;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);";
  close.innerHTML = "&times;";

  var frame = document.createElement("iframe");
  var previewVideo = previewVideoFor(videoId, fallbackVideo);
  frame.title = "Feed vertical Luup";
  frame.allow = "autoplay; clipboard-write; encrypted-media; fullscreen";
  frame.style.cssText =
    // The plain 100vh comes first as a fallback for browsers without
    // dynamic-viewport-unit support (Safari <15.4, older Chromium) — the
    // 100dvh declaration right after it wins wherever it's understood.
    "width:min(100vw,430px);height:100vh;height:100dvh;max-height:100vh;max-height:100dvh;border:0;background:#000;box-shadow:0 24px 80px rgba(0,0,0,.42);" +
    (reduceMotion
      ? ""
      : "opacity:0;transform:translateY(18px) scale(.97);" + frameTransitionStyle);

  function setFrameSrc(customerStatus: CustomerStatus) {
    var params =
      "/feed?embed=1" +
      "&autoplay_sound=1" +
      (videoId ? "&v=" + encodeURIComponent(videoId) : "") +
      "&product_url=" +
      encodeURIComponent(productUrlOverride || ctx.currentProductUrl()) +
      "&customer_logged_in=" +
      (customerStatus.loggedIn ? "1" : "0") +
      "&customer_approved=" +
      (customerStatus.approved ? "1" : "0") +
      "&customer_status=" +
      encodeURIComponent(customerStatus.status || "UNKNOWN");

    frame.src =
      ctx.luppBaseUrl +
      "/s/" +
      encodeURIComponent(store.slug as string) +
      params +
      (previewVideo && videoMediaUrl(previewVideo)
        ? "&preview_video_url=" + encodeURIComponent(videoMediaUrl(previewVideo))
        : "") +
      (previewVideo && previewVideo.thumbnail_url
        ? "&preview_poster_url=" +
          encodeURIComponent(previewVideo.thumbnail_url)
        : "");
  }

  var shouldForceCustomerRefresh = isUpzeroStore(store);
  var initialCustomerStatus =
    ctx.sharedState.upzeroCustomerStatusCache && ctx.sharedState.upzeroCustomerStatusCache.approved
      ? ctx.sharedState.upzeroCustomerStatusCache
      : {
          approved: false,
          loggedIn: false,
          status: shouldForceCustomerRefresh ? "CHECKING" : "not_applicable",
        };

  setFrameSrc(initialCustomerStatus);
  // Non-Upzero stores already got the final status synchronously above —
  // detectCustomerStatus resolves to the same "not_applicable" shape for
  // them, just asynchronously, and re-setting frame.src from that would
  // reload the just-opened feed iframe a second time for no reason.
  if (shouldForceCustomerRefresh) {
    ctx.detectCustomerStatus(store, { forceRefresh: true }).then(function (customerStatus) {
      setFrameSrc(customerStatus);
    });
  }

  var feedbackShown = false;

  function trackFeedClose(reason?: string) {
    if (closeTracked) return;
    closeTracked = true;
    var durationSeconds = Math.max(
      0,
      Math.round((Date.now() - openedAt) / 1000),
    );
    ctx.track(store.id, "feed_close", videoId || null, null, {
      close_reason: reason || "close",
      duration_seconds: durationSeconds,
      duration_ms: Date.now() - openedAt,
      had_cart_update: !!ctx.sharedState.pendingStorefrontCartRefresh,
    });
  }

  function restoreFocusToLauncher() {
    if (
      previouslyFocusedElement &&
      typeof previouslyFocusedElement.focus === "function" &&
      document.contains(previouslyFocusedElement)
    ) {
      previouslyFocusedElement.focus();
    }
  }

  function destroyOverlay(reason?: string) {
    trackFeedClose(reason);
    document.body.style.overflow = previousOverflow;
    document.removeEventListener("keydown", onOverlayKeydown);
    ctx.flushPendingStorefrontCartRefresh();

    if (reduceMotion) {
      overlay.remove();
      restoreFocusToLauncher();
      return;
    }

    // Play the close transition, then remove — with a fallback timeout in
    // case transitionend never fires (e.g. the element was already detached
    // by other cleanup, or the browser drops the event under heavy load).
    var removed = false;
    function removeNow() {
      if (removed) return;
      removed = true;
      overlay.remove();
      restoreFocusToLauncher();
    }
    overlay.addEventListener("transitionend", removeNow, { once: true });
    window.setTimeout(removeNow, OVERLAY_TRANSITION_MS + 120);
    overlay.style.opacity = "0";
    frame.style.opacity = "0";
    frame.style.transform = "translateY(18px) scale(.97)";
  }

  // Keeps Tab/Shift+Tab cycling inside the overlay instead of reaching the
  // storefront page behind it — the previous version had no focus trap at
  // all, and its Escape listener only ever removed itself, leaking a
  // document-level keydown listener on every close via the × button or
  // backdrop click.
  function focusableOverlayElements(): HTMLElement[] {
    var nodeList = overlay.querySelectorAll(
      'button, [href], input, select, textarea, iframe, [tabindex]:not([tabindex="-1"])',
    );
    return Array.prototype.slice.call(nodeList);
  }

  function onOverlayKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      showFeedbackForm();
      return;
    }
    if (event.key !== "Tab") return;
    var focusable = focusableOverlayElements();
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function showFeedbackForm() {
    if (feedbackShown || !ctx.sharedState.showFeedbackFormOnClose) {
      destroyOverlay(feedbackShown ? "feedback_already_open" : "close");
      return;
    }

    feedbackShown = true;
    frame.style.filter = "blur(12px) brightness(.58)";
    overlay.style.background = "rgba(0,0,0,.62)";
    close.style.display = "none";

    var selectedRating = 0;
    var feedback = document.createElement("div");
    feedback.setAttribute("data-lupp-feedback", "true");
    feedback.style.cssText =
      "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:12px;color:#fff;";

    feedback.innerHTML =
      '<div style="width:min(100%,320px);border-radius:18px;background:radial-gradient(circle at 50% 0%,rgba(255,255,255,.28),rgba(255,255,255,.08) 42%,rgba(0,0,0,.34));box-shadow:0 28px 90px rgba(0,0,0,.55);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);padding:28px;display:flex;flex-direction:column;align-items:stretch;gap:18px;">' +
      '<p style="margin:0;text-align:center;font-size:16px;line-height:1.3;font-weight:800;">Como foi sua experiência?</p>' +
      '<div data-lupp-feedback-stars style="display:flex;justify-content:center;gap:10px;"></div>' +
      '<button data-lupp-feedback-submit type="button" style="height:44px;border:0;border-radius:8px;background:#fff;color:#050505;font-family:inherit;font-size:15px;font-weight:800;line-height:1;cursor:pointer;">Enviar</button>' +
      '<button data-lupp-feedback-skip type="button" style="height:36px;border:0;background:transparent;color:rgba(255,255,255,.78);font-family:inherit;font-size:13px;font-weight:700;line-height:1;cursor:pointer;">Agora não</button>' +
      "</div>";

    var starList = feedback.querySelector("[data-lupp-feedback-stars]")!;

    function renderStars() {
      starList.innerHTML = [1, 2, 3, 4, 5]
        .map(function (rating) {
          return (
            '<button data-lupp-feedback-star="' +
            rating +
            '" type="button" aria-label="' +
            rating +
            ' estrelas" aria-pressed="' +
            (selectedRating >= rating ? "true" : "false") +
            '" style="border:0;background:transparent;color:' +
            (selectedRating >= rating ? "#facc15" : "rgba(255,255,255,.38)") +
            ';font-size:32px;line-height:1;cursor:pointer;padding:0 2px;">★</button>'
          );
        })
        .join("");
    }

    renderStars();
    feedback.addEventListener("click", function (event) {
      event.stopPropagation();
      var eventTarget = event.target as HTMLElement;
      var starButton = eventTarget.closest("[data-lupp-feedback-star]");
      if (starButton) {
        selectedRating = Number(
          starButton.getAttribute("data-lupp-feedback-star") || 0,
        );
        renderStars();
        return;
      }

      if (eventTarget.closest("[data-lupp-feedback-submit]")) {
        ctx.track(store.id, "widget_view", videoId || null, null, {
          action: "feedback_submit",
          feedback_rating: selectedRating,
        });
        destroyOverlay("feedback_submit");
        return;
      }

      if (eventTarget.closest("[data-lupp-feedback-skip]")) {
        ctx.track(store.id, "widget_view", videoId || null, null, {
          action: "feedback_skip",
        });
        destroyOverlay("feedback_skip");
      }
    });

    overlay.appendChild(feedback);
  }

  close.addEventListener("click", showFeedbackForm);
  overlay.addEventListener("click", function (event) {
    if (event.target === overlay) showFeedbackForm();
  });
  document.addEventListener("keydown", onOverlayKeydown);

  overlay.appendChild(frame);
  overlay.appendChild(close);
  document.body.appendChild(overlay);
  close.focus();

  if (!reduceMotion) {
    // Flip to the "shown" state on the next frame so the browser has
    // committed the initial opacity:0/translateY styles first — setting
    // both in the same tick would skip the transition entirely.
    requestAnimationFrame(function () {
      overlay.style.opacity = "1";
      frame.style.opacity = "1";
      frame.style.transform = "translateY(0) scale(1)";
    });
  }

  ctx.track(store.id, "feed_open", videoId || null, null, {
    opened_from: "floating_launcher",
  });
}
