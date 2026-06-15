(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var storeSlug = script.getAttribute("data-store");
  var widgetType = script.getAttribute("data-widget") || "home-showcase";
  var productUrl = script.getAttribute("data-product-url") || window.location.href;
  var supabaseUrl = script.getAttribute("data-supabase-url") || window.LUPP_SUPABASE_URL || "";
  var supabaseKey = script.getAttribute("data-supabase-key") || window.LUPP_SUPABASE_ANON_KEY || "";

  if (!storeSlug || !supabaseUrl || !supabaseKey) {
    console.warn("[Lupp] Configure data-store, data-supabase-url e data-supabase-key para carregar o widget.");
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

  function fetchJson(path) {
    return fetch(apiBase + path, { headers: headers }).then(function (response) {
      if (!response.ok) throw new Error("Lupp API error: " + response.status);
      return response.json();
    });
  }

  function track(storeId, eventType, videoId, productId) {
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
        metadata: { widget_type: widgetType, product_url: productUrl },
      }),
    }).catch(function () {});
  }

  function createRoot() {
    var root = document.createElement("div");
    root.setAttribute("data-lupp-widget-root", widgetType);
    if (widgetType === "floating-video") {
      root.style.position = "fixed";
      root.style.right = "18px";
      root.style.bottom = "18px";
      root.style.zIndex = "999999";
    }
    script.parentNode.insertBefore(root, script.nextSibling);
    return root;
  }

  function render(root, store, videos) {
    var accent = store.button_color || "#006BFF";
    var items = videos.slice(0, widgetType === "stories-bar" ? 8 : 6);

    if (!items.length) {
      root.innerHTML = "";
      return;
    }

    var style =
      "font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#F7FAFF;" +
      "--lupp-accent:" +
      accent;

    if (widgetType === "stories-bar") {
      root.innerHTML =
        '<div style="' +
        style +
        ';display:flex;gap:12px;overflow:auto;padding:10px 0">' +
        items
          .map(function (video) {
            return (
              '<button data-video="' +
              video.id +
              '" style="border:0;background:transparent;color:inherit;width:76px;cursor:pointer">' +
              '<span style="display:block;width:64px;height:64px;border:2px solid var(--lupp-accent);border-radius:999px;background:#121B33 center/cover no-repeat;background-image:url(' +
              (video.thumbnail_url || "") +
              ')"></span>' +
              '<span style="display:block;margin-top:6px;font-size:11px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
              video.title +
              "</span></button>"
            );
          })
          .join("") +
        "</div>";
      return;
    }

    if (widgetType === "floating-video") {
      var video = items[0];
      root.innerHTML =
        '<button data-video="' +
        video.id +
        '" style="' +
        style +
        ';width:104px;border:1px solid rgba(255,255,255,.18);border-radius:16px;background:#121B33;box-shadow:0 18px 60px rgba(0,0,0,.35);padding:6px;cursor:pointer">' +
        '<video muted playsinline loop autoplay src="' +
        (video.video_url || "") +
        '" poster="' +
        (video.thumbnail_url || "") +
        '" style="width:92px;aspect-ratio:9/16;object-fit:cover;border-radius:12px;background:#050A18"></video>' +
        '<span style="display:block;margin-top:6px;font-size:11px;line-height:1.2">' +
        video.cta_label +
        "</span></button>";
      return;
    }

    root.innerHTML =
      '<div style="' +
      style +
      ';display:flex;gap:14px;overflow:auto;padding:8px 0">' +
      items
        .map(function (video) {
          return (
            '<article style="min-width:150px;max-width:150px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:#121B33;overflow:hidden">' +
            '<button data-video="' +
            video.id +
            '" style="display:block;border:0;padding:0;background:transparent;color:inherit;cursor:pointer;text-align:left;width:100%">' +
            '<video muted playsinline preload="metadata" src="' +
            (video.video_url || "") +
            '" poster="' +
            (video.thumbnail_url || "") +
            '" style="width:100%;aspect-ratio:9/16;object-fit:cover;background:#050A18"></video>' +
            '<span style="display:block;padding:10px;font-size:13px;line-height:1.25;font-weight:700">' +
            video.title +
            '</span><span style="display:block;margin:0 10px 10px;padding:8px 10px;border-radius:8px;background:var(--lupp-accent);font-size:12px;text-align:center">' +
            video.cta_label +
            "</span></button></article>"
          );
        })
        .join("") +
      "</div>";
  }

  var root = createRoot();

  fetchJson("/stores?slug=eq." + encodeURIComponent(storeSlug) + "&status=eq.active&select=*")
    .then(function (stores) {
      var store = stores[0];
      if (!store) throw new Error("Lupp store not found");
      track(store.id, "widget_view");

      var videoQuery =
        "/videos?store_id=eq." +
        store.id +
        "&status=eq.active&is_feed_enabled=eq.true&select=*&order=sort_order.asc,created_at.desc";

      return fetchJson(videoQuery).then(function (videos) {
        render(root, store, videos);
        root.addEventListener("click", function (event) {
          var button = event.target.closest("[data-video]");
          if (!button) return;
          var video = videos.find(function (item) {
            return item.id === button.getAttribute("data-video");
          });
          if (!video) return;
          track(store.id, "video_view", video.id);
          window.open("/s/" + store.slug + "/feed?v=" + video.id, "_blank", "noopener");
        });
      });
    })
    .catch(function (error) {
      console.warn("[Lupp]", error.message);
      root.innerHTML = "";
    });
})();
