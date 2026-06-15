(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var storeSlug = script.getAttribute("data-store");
  var widgetType = (script.getAttribute("data-widget") || "floating_launcher").replace(/-/g, "_");
  var productUrl = script.getAttribute("data-product-url") || window.location.href;
  var supabaseUrl = script.getAttribute("data-supabase-url") || window.LUPP_SUPABASE_URL || "";
  var supabaseKey = script.getAttribute("data-supabase-key") || window.LUPP_SUPABASE_ANON_KEY || "";
  var luppBaseUrl = (script.getAttribute("data-lupp-url") || new URL(script.src).origin).replace(/\/$/, "");

  var launcherConfig = {
    position: script.getAttribute("data-position") || "bottom-left",
    accentColor: script.getAttribute("data-accent-color") || "#fe2c55",
    backgroundColor: script.getAttribute("data-background-color") || "#0b0b0f",
    textColor: script.getAttribute("data-text-color") || "#ffffff",
    label: script.getAttribute("data-label") || "Compre pelo vídeo",
    fontFamily: script.getAttribute("data-font-family") || "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    bubbleSize: Number(script.getAttribute("data-bubble-size") || 74),
    offsetX: Number(script.getAttribute("data-offset-x") || 18),
    offsetY: Number(script.getAttribute("data-offset-y") || 18),
  };

  if (!storeSlug || !supabaseUrl || !supabaseKey) {
    console.warn("[Luup] Configure data-store, data-supabase-url e data-supabase-key para carregar o widget.");
    return;
  }

  var apiBase = supabaseUrl.replace(/\/$/, "") + "/rest/v1";
  var headers = {
    apikey: supabaseKey,
    Authorization: "Bearer " + supabaseKey,
  };

  function ensureVisitorId() {
    var key = "lupp_visitor_id";
    var current = localStorage.getItem(key);
    if (current) return current;
    var id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    localStorage.setItem(key, id);
    return id;
  }

  function ensureSessionId() {
    var key = "lupp_session_id";
    var current = sessionStorage.getItem(key);
    if (current) return current;
    var id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    sessionStorage.setItem(key, id);
    return id;
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
    });
  }

  function fetchJson(path) {
    return fetch(apiBase + path, { headers: headers }).then(function (response) {
      if (!response.ok) throw new Error("Luup API error: " + response.status);
      return response.json();
    });
  }

  function track(storeId, eventType, videoId, productId, metadata) {
    if (!storeId) return;
    fetch(apiBase + "/analytics_events", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json", Prefer: "return=minimal" }, headers),
      body: JSON.stringify({
        store_id: storeId,
        video_id: videoId || null,
        product_id: productId || null,
        event_type: eventType,
        visitor_id: ensureVisitorId(),
        session_id: ensureSessionId(),
        url: window.location.href,
        referrer: document.referrer || null,
        user_agent: navigator.userAgent,
        metadata: Object.assign({ widget_type: widgetType, product_url: productUrl }, metadata || {}),
      }),
    }).catch(function () {});
  }

  function createRoot() {
    var root = document.createElement("div");
    root.setAttribute("data-lupp-widget-root", widgetType);
    script.parentNode.insertBefore(root, script.nextSibling);
    return root;
  }

  function positionStyles() {
    var styles = [
      "position:fixed",
      "z-index:2147483000",
    ];
    var x = launcherConfig.offsetX + "px";
    var y = launcherConfig.offsetY + "px";

    if (launcherConfig.position.indexOf("top") === 0) styles.push("top:" + y);
    else styles.push("bottom:" + y);

    if (launcherConfig.position.indexOf("right") > -1) styles.push("right:" + x);
    else styles.push("left:" + x);

    return styles.join(";");
  }

  function openFeedOverlay(store, videoId) {
    var existing = document.querySelector("[data-lupp-feed-overlay]");
    if (existing) existing.remove();

    var previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    var overlay = document.createElement("div");
    overlay.setAttribute("data-lupp-feed-overlay", "true");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.76);display:flex;align-items:center;justify-content:center;font-family:" +
      launcherConfig.fontFamily +
      ";";

    var close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Fechar feed Luup");
    close.style.cssText =
      "position:absolute;right:16px;top:16px;width:42px;height:42px;border:0;border-radius:999px;background:rgba(255,255,255,.14);color:#fff;font-size:28px;line-height:1;cursor:pointer;backdrop-filter:blur(10px);";
    close.innerHTML = "&times;";

    var frame = document.createElement("iframe");
    frame.title = "Feed vertical Luup";
    frame.allow = "autoplay; clipboard-write; encrypted-media; fullscreen";
    frame.style.cssText =
      "width:min(100vw,430px);height:100dvh;max-height:100dvh;border:0;background:#000;box-shadow:0 24px 80px rgba(0,0,0,.42);";
    frame.src = luppBaseUrl + "/s/" + encodeURIComponent(store.slug) + "/feed?embed=1" + (videoId ? "&v=" + encodeURIComponent(videoId) : "");

    var feedbackShown = false;

    function destroyOverlay() {
      overlay.remove();
      document.body.style.overflow = previousOverflow;
    }

    function showFeedbackForm() {
      if (feedbackShown) {
        destroyOverlay();
        return;
      }

      feedbackShown = true;
      frame.style.filter = "blur(12px) brightness(.58)";
      overlay.style.background = "rgba(0,0,0,.62)";
      close.style.display = "none";

      var selected = "";
      var feedback = document.createElement("div");
      feedback.setAttribute("data-lupp-feedback", "true");
      feedback.style.cssText =
        "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:12px;color:#fff;";

      feedback.innerHTML =
        '<div style="width:min(100%,430px);height:min(100dvh,805px);border-radius:18px;background:radial-gradient(circle at 50% 0%,rgba(255,255,255,.28),rgba(255,255,255,.08) 42%,rgba(0,0,0,.34));box-shadow:0 28px 90px rgba(0,0,0,.55);backdrop-filter:blur(18px);padding:26px 28px;display:flex;flex-direction:column;justify-content:center;gap:14px;">' +
        '<div style="display:flex;justify-content:center;margin-bottom:4px;"><svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path><path d="M8 9h8"></path><path d="M8 13h5"></path></svg></div>' +
        '<div style="text-align:center;margin-bottom:18px;"><h2 style="margin:0 0 8px;font-size:20px;line-height:1.1;font-weight:800;">Queremos saber sua opinião!</h2><p style="margin:0 auto;max-width:360px;font-size:12px;line-height:1.15;font-weight:700;color:rgba(255,255,255,.92);">Sua experiência é muito importante para nós. Responda rapidamente e ajude-nos a melhorar cada vez mais.</p></div>' +
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
      var optionList = feedback.querySelector("[data-lupp-feedback-options]");

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

      renderOptions();
      feedback.addEventListener("click", function (event) {
        event.stopPropagation();
        var optionButton = event.target.closest("[data-lupp-feedback-option]");
        if (optionButton) {
          selected = optionButton.getAttribute("data-lupp-feedback-option") || "";
          renderOptions();
          return;
        }

        if (event.target.closest("[data-lupp-feedback-submit]")) {
          var text = feedback.querySelector("[data-lupp-feedback-text]").value || "";
          track(store.id, "widget_view", videoId || null, null, {
            action: "feedback_submit",
            feedback_option: selected,
            feedback_text: text,
          });
          destroyOverlay();
          return;
        }

        if (event.target.closest("[data-lupp-feedback-skip]")) {
          track(store.id, "widget_view", videoId || null, null, { action: "feedback_skip" });
          destroyOverlay();
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
    track(store.id, "feed_open", videoId || null, null, { opened_from: "floating_launcher" });
  }

  function renderLauncher(root, store, videos) {
    var video = videos[0] || {};
    var size = Math.max(56, launcherConfig.bubbleSize);
    var media = video.video_url
      ? '<video muted playsinline loop autoplay src="' +
        escapeHtml(video.video_url) +
        '" poster="' +
        escapeHtml(video.thumbnail_url || "") +
        '" style="width:100%;height:100%;object-fit:cover;border-radius:999px;background:#111"></video>'
      : '<span style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:' +
        launcherConfig.textColor +
        '">▶</span>';

    root.style.cssText = positionStyles();
    root.innerHTML =
      '<button type="button" data-lupp-launcher style="' +
      "display:flex;align-items:center;gap:10px;border:0;background:transparent;padding:0;cursor:pointer;font-family:" +
      launcherConfig.fontFamily +
      ';filter:drop-shadow(0 14px 28px rgba(0,0,0,.28));">' +
      '<span style="position:relative;display:block;width:' +
      size +
      "px;height:" +
      size +
      "px;border-radius:999px;background:" +
      launcherConfig.backgroundColor +
      ";border:3px solid #fff;box-shadow:0 0 0 2px " +
      launcherConfig.accentColor +
      ',0 12px 32px rgba(0,0,0,.32);overflow:hidden">' +
      media +
      '<span style="position:absolute;right:3px;bottom:3px;width:17px;height:17px;border-radius:999px;background:' +
      launcherConfig.accentColor +
      ';border:2px solid #fff"></span></span>' +
      (launcherConfig.label
        ? '<span style="max-width:158px;border-radius:999px;background:' +
          launcherConfig.backgroundColor +
          ";color:" +
          launcherConfig.textColor +
          ';padding:8px 12px;font-size:12px;font-weight:800;line-height:1.15;white-space:nowrap">' +
          escapeHtml(launcherConfig.label) +
          "</span>"
        : "") +
      "</button>";

    root.querySelector("[data-lupp-launcher]").addEventListener("click", function () {
      track(store.id, "video_view", video.id || null, null, { opened_from: "floating_launcher" });
      openFeedOverlay(store, video.id);
    });
  }

  function renderStoriesBar(root, store, videos) {
    var accent = launcherConfig.accentColor || store.button_color || "#006BFF";
    root.innerHTML =
      '<div style="font-family:' +
      launcherConfig.fontFamily +
      ';display:flex;gap:12px;overflow:auto;padding:10px 0;color:#111">' +
      videos
        .slice(0, 8)
        .map(function (video) {
          return (
            '<button data-video="' +
            video.id +
            '" style="border:0;background:transparent;color:inherit;width:76px;cursor:pointer">' +
            '<span style="display:block;width:64px;height:64px;border:2px solid ' +
            accent +
            ";border-radius:999px;background:#121B33 center/cover no-repeat;background-image:url(" +
            escapeHtml(video.thumbnail_url || "") +
            ')"></span>' +
            '<span style="display:block;margin-top:6px;font-size:11px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
            escapeHtml(video.title) +
            "</span></button>"
          );
        })
        .join("") +
      "</div>";

    root.addEventListener("click", function (event) {
      var button = event.target.closest("[data-video]");
      if (!button) return;
      openFeedOverlay(store, button.getAttribute("data-video"));
    });
  }

  function renderCarousel(root, store, videos) {
    var accent = launcherConfig.accentColor || store.button_color || "#006BFF";
    root.innerHTML =
      '<div style="font-family:' +
      launcherConfig.fontFamily +
      ';display:flex;gap:14px;overflow:auto;padding:8px 0;color:#F7FAFF">' +
      videos
        .slice(0, 6)
        .map(function (video) {
          return (
            '<article style="min-width:150px;max-width:150px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:#121B33;overflow:hidden">' +
            '<button data-video="' +
            video.id +
            '" style="display:block;border:0;padding:0;background:transparent;color:inherit;cursor:pointer;text-align:left;width:100%">' +
            '<video muted playsinline preload="metadata" src="' +
            escapeHtml(video.video_url || "") +
            '" poster="' +
            escapeHtml(video.thumbnail_url || "") +
            '" style="width:100%;aspect-ratio:9/16;object-fit:cover;background:#050A18"></video>' +
            '<span style="display:block;padding:10px;font-size:13px;line-height:1.25;font-weight:700">' +
            escapeHtml(video.title) +
            '</span><span style="display:block;margin:0 10px 10px;padding:8px 10px;border-radius:8px;background:' +
            accent +
            ';font-size:12px;text-align:center">' +
            escapeHtml(video.cta_label || "Comprar agora") +
            "</span></button></article>"
          );
        })
        .join("") +
      "</div>";

    root.addEventListener("click", function (event) {
      var button = event.target.closest("[data-video]");
      if (!button) return;
      openFeedOverlay(store, button.getAttribute("data-video"));
    });
  }

  function render(root, store, videos) {
    if (!videos.length && (widgetType === "floating_launcher" || widgetType === "floating_video")) {
      renderLauncher(root, store, []);
      return;
    }

    if (!videos.length) {
      root.innerHTML = "";
      return;
    }

    if (widgetType === "stories_bar") {
      renderStoriesBar(root, store, videos);
      return;
    }

    if (widgetType === "floating_launcher" || widgetType === "floating_video") {
      renderLauncher(root, store, videos);
      return;
    }

    renderCarousel(root, store, videos);
  }

  var root = createRoot();

  fetchJson("/stores?slug=eq." + encodeURIComponent(storeSlug) + "&status=eq.active&select=*")
    .then(function (stores) {
      var store = stores[0] || {
        id: null,
        slug: storeSlug,
        button_color: launcherConfig.accentColor,
      };
      track(store.id, "widget_view");

      var videoQuery =
        "/videos?store_id=eq." +
        store.id +
        "&status=eq.active&is_feed_enabled=eq.true&select=*&order=sort_order.asc,created_at.desc";

      return fetchJson(videoQuery).then(function (videos) {
        render(root, store, videos);
      });
    })
    .catch(function (error) {
      console.warn("[Luup]", error.message);
      renderLauncher(root, { id: null, slug: storeSlug, button_color: launcherConfig.accentColor }, []);
    });
})();
