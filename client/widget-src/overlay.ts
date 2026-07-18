// Lupp widget – feed overlay (fullscreen iframe + feedback form) and the
// postMessage plumbing shared with the feed iframe and platform adapters.
import {
  escapeHtml,
  getUrlHostname,
  getUrlOrigin,
  resolveUrl,
  sameStorefrontHostname,
} from "./utils";
import { ctx, isUpzeroStore, videoMediaUrl } from "./context";
import type { CustomerStatus, SlimVideo, StorePayload } from "./types";

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

  var overlay = document.createElement("div");
  overlay.setAttribute("data-lupp-feed-overlay", "true");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.76);display:flex;align-items:center;justify-content:center;font-family:" +
    ctx.launcherConfig.fontFamily +
    ";";

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
    "width:min(100vw,430px);height:100dvh;max-height:100dvh;border:0;background:#000;box-shadow:0 24px 80px rgba(0,0,0,.42);";

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
  ctx.detectCustomerStatus(store, {
    forceRefresh: shouldForceCustomerRefresh,
  }).then(function (customerStatus) {
    setFrameSrc(customerStatus);
  });

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

  function destroyOverlay(reason?: string) {
    trackFeedClose(reason);
    overlay.remove();
    document.body.style.overflow = previousOverflow;
    ctx.flushPendingStorefrontCartRefresh();
  }

  function showFeedbackForm() {
    if (feedbackShown) {
      destroyOverlay("feedback_already_open");
      return;
    }

    feedbackShown = true;
    frame.style.filter = "blur(12px) brightness(.58)";
    overlay.style.background = "rgba(0,0,0,.62)";
    close.style.display = "none";

    var selected = "";
    var selectedRating = 0;
    var feedbackLogoUrl = resolveUrl(
      "/luup-logo-completa-white.png",
      ctx.luppBaseUrl,
    );
    var feedback = document.createElement("div");
    feedback.setAttribute("data-lupp-feedback", "true");
    feedback.style.cssText =
      "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:12px;color:#fff;";

    feedback.innerHTML =
      '<div style="width:min(100%,430px);height:min(100dvh,805px);border-radius:18px;background:radial-gradient(circle at 50% 0%,rgba(255,255,255,.28),rgba(255,255,255,.08) 42%,rgba(0,0,0,.34));box-shadow:0 28px 90px rgba(0,0,0,.55);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);padding:26px 28px;display:flex;flex-direction:column;justify-content:center;gap:14px;">' +
      '<a href="' +
      escapeHtml(ctx.luppBaseUrl || "https://luup.dzns.com.br") +
      '" target="_blank" rel="noopener noreferrer" aria-label="Luup" style="display:flex;justify-content:center;margin-bottom:4px;text-decoration:none;"><img src="' +
      escapeHtml(feedbackLogoUrl) +
      '" alt="Luup" style="height:42px;max-width:150px;object-fit:contain;display:block;"/></a>' +
      '<div style="text-align:center;margin-bottom:8px;"><h2 style="margin:0 0 8px;font-size:20px;line-height:1.1;font-weight:800;">Queremos saber sua opinião!</h2><p style="margin:0 auto;max-width:360px;font-size:12px;line-height:1.15;font-weight:700;color:rgba(255,255,255,.92);">Sua experiência é muito importante para nós. Responda rapidamente e ajude-nos a melhorar cada vez mais.</p></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px;"><div style="border:1px solid rgba(255,255,255,.24);border-radius:10px;background:rgba(255,255,255,.12);padding:10px;text-align:center;"><strong style="display:block;font-size:18px;line-height:1;">0</strong><span style="display:block;margin-top:3px;font-size:11px;font-weight:800;color:rgba(255,255,255,.76);">Comentários</span></div><div style="border:1px solid rgba(255,255,255,.24);border-radius:10px;background:rgba(255,255,255,.12);padding:10px;text-align:center;"><strong data-lupp-rating-count style="display:block;font-size:18px;line-height:1;">0/5</strong><span style="display:block;margin-top:3px;font-size:11px;font-weight:800;color:rgba(255,255,255,.76);">Estrelas</span></div></div>' +
      '<div data-lupp-feedback-stars style="display:flex;justify-content:center;gap:8px;margin-bottom:10px;"></div>' +
      '<div data-lupp-feedback-options style="display:grid;gap:10px;"></div>' +
      '<textarea data-lupp-feedback-text placeholder="Deixe aqui sua sugestão do que achou ou de como podemos melhorar." style="margin-top:24px;width:100%;min-height:66px;resize:none;border:1px solid rgba(255,255,255,.32);border-radius:9px;background:rgba(255,255,255,.13);color:#fff;outline:none;padding:14px;font-family:inherit;font-size:13px;font-weight:600;line-height:1.4;box-sizing:border-box;"></textarea>' +
      '<button data-lupp-feedback-submit type="button" style="height:40px;border:0;border-radius:5px;background:#fff;color:#050505;font-family:inherit;font-size:15px;font-weight:800;line-height:1;cursor:pointer;">Enviar Feedback</button>' +
      '<button data-lupp-feedback-skip type="button" style="height:40px;border:0;background:transparent;color:#fff;font-family:inherit;font-size:16px;font-weight:800;line-height:1;cursor:pointer;">Agora não</button>' +
      "</div>";

    var options = [
      "A experiência foi incrível",
      "Atendeu às expectativas",
      "Poderia ser melhor",
      "Prefiro ver somente fotos",
    ];
    var optionList = feedback.querySelector("[data-lupp-feedback-options]")!;
    var starList = feedback.querySelector("[data-lupp-feedback-stars]")!;
    var ratingCount = feedback.querySelector("[data-lupp-rating-count]")!;

    function renderStars() {
      starList.innerHTML = [1, 2, 3, 4, 5]
        .map(function (rating) {
          return (
            '<button data-lupp-feedback-star="' +
            rating +
            '" type="button" aria-label="' +
            rating +
            ' estrelas" style="border:0;background:transparent;color:' +
            (selectedRating >= rating ? "#facc15" : "rgba(255,255,255,.38)") +
            ';font-size:30px;line-height:1;cursor:pointer;padding:0 2px;">★</button>'
          );
        })
        .join("");
      ratingCount.textContent = selectedRating + "/5";
    }

    function renderOptions() {
      optionList.innerHTML = options
        .map(function (option) {
          var active = selected === option;
          return (
            '<button data-lupp-feedback-option="' +
            escapeHtml(option) +
            '" type="button" style="height:42px;display:flex;align-items:center;gap:14px;border:1px solid rgba(255,255,255,.34);border-radius:9px;background:' +
            (active ? "rgba(255,255,255,.28)" : "rgba(255,255,255,.15)") +
            ';color:#fff;text-align:left;padding:0 12px;font-family:inherit;font-size:14px;font-weight:800;line-height:1;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.16);"><span style="width:20px;height:20px;border-radius:999px;background:rgba(255,255,255,.86);color:#9ca3af;display:inline-flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;">✓</span><span>' +
            escapeHtml(option) +
            "</span></button>"
          );
        })
        .join("");
    }

    renderStars();
    renderOptions();
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

      var optionButton = eventTarget.closest("[data-lupp-feedback-option]");
      if (optionButton) {
        selected =
          optionButton.getAttribute("data-lupp-feedback-option") || "";
        renderOptions();
        return;
      }

      if (eventTarget.closest("[data-lupp-feedback-submit]")) {
        var text =
          (
            feedback.querySelector(
              "[data-lupp-feedback-text]",
            ) as HTMLTextAreaElement
          ).value || "";
        ctx.track(store.id, "widget_view", videoId || null, null, {
          action: "feedback_submit",
          feedback_option: selected,
          feedback_rating: selectedRating,
          feedback_text: text,
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
  document.addEventListener("keydown", function onKeydown(event) {
    if (event.key !== "Escape") return;
    document.removeEventListener("keydown", onKeydown);
    showFeedbackForm();
  });

  overlay.appendChild(frame);
  overlay.appendChild(close);
  document.body.appendChild(overlay);
  ctx.track(store.id, "feed_open", videoId || null, null, {
    opened_from: "floating_launcher",
  });
}
