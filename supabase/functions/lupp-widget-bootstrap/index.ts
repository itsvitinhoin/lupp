import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

type BunnyVideo = {
  guid?: string;
  length?: number;
  status?: number;
  storageSize?: number;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function normalizedDomain(value: unknown) {
  const text = clean(value).toLowerCase();
  if (!text) return "";
  try {
    return new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`).hostname.replace(/^www\./, "");
  } catch (_) {
    return text
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .split("?")[0]
      .trim();
  }
}

function findUpzeroStoreIdInObject(value: unknown, depth = 0): number | null {
  if (!value || typeof value !== "object" || depth > 8) return null;

  const record = value as Record<string, unknown>;
  const directKeys = [
    "storefrontStoreId",
    "storefront_store_id",
    "storeId",
    "store_id",
    "upzeroStoreId",
    "upzero_store_id",
  ];

  for (const key of directKeys) {
    const directValue = Number(record[key]);
    if (Number.isFinite(directValue) && directValue > 0) {
      return Math.trunc(directValue);
    }
  }

  const nestedStore =
    record.store || record.storefront || record.storefrontStore;
  if (nestedStore && typeof nestedStore === "object") {
    const nestedRecord = nestedStore as Record<string, unknown>;
    const nestedId = Number(nestedRecord.id || nestedRecord.storeId);
    if (Number.isFinite(nestedId) && nestedId > 0) return Math.trunc(nestedId);
  }

  for (const key of Object.keys(record)) {
    const child = record[key];
    if (!child || typeof child !== "object") continue;
    const found = findUpzeroStoreIdInObject(child, depth + 1);
    if (found) return found;
  }

  return null;
}

function extractUpzeroStorefrontStoreIdFromJsonText(text: string) {
  const source = String(text || "");
  const snippets: string[] = [];
  source.replace(
    /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi,
    (_, json: string) => {
      if (json) snippets.push(json);
      return "";
    },
  );

  if (!snippets.length && /^[\s\r\n]*[\[{]/.test(source) && source.length < 250000) {
    snippets.push(source);
  }

  for (const snippet of snippets) {
    try {
      const parsed = JSON.parse(snippet);
      const storeId = findUpzeroStoreIdInObject(parsed);
      if (storeId) return storeId;
    } catch (_) {
      // Ignore non-JSON scripts.
    }
  }

  return null;
}

function extractUpzeroStorefrontStoreIdFromText(text: string) {
  const source = String(text || "");
  const patterns = [
    /"storeId"\s*:\s*(\d+)/,
    /"store_id"\s*:\s*(\d+)/,
    /"storefrontStoreId"\s*:\s*(\d+)/,
    /"storefront_store_id"\s*:\s*(\d+)/,
    /"store"\s*:\s*\{[^}]{0,1200}"id"\s*:\s*(\d+)/,
    /storeId\\?":(\d+)/,
    /store_id\\?":(\d+)/,
    /storefrontStoreId\\?":(\d+)/,
    /storefront_store_id\\?":(\d+)/,
    /storeId&quot;:\s*(\d+)/,
    /store_id&quot;:\s*(\d+)/,
    /storefront_store_id&quot;:\s*(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    const value = Number(match?.[1]);
    if (Number.isFinite(value) && value > 0) return Math.trunc(value);
  }

  return extractUpzeroStorefrontStoreIdFromJsonText(source);
}

function resolveExternalUrl(value: string, base: string) {
  try {
    return new URL(value, base).href;
  } catch (_) {
    return "";
  }
}

function extractScriptSourcesFromHtml(html: string, pageUrl: string) {
  const sources: string[] = [];
  const seen = new Set<string>();
  String(html || "").replace(
    /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,
    (_, src: string) => {
      const resolved = resolveExternalUrl(src, pageUrl);
      if (resolved && !seen.has(resolved)) {
        seen.add(resolved);
        sources.push(resolved);
      }
      return "";
    },
  );
  return sources;
}

async function discoverUpzeroStorefrontStoreId(storefrontUrlValue: unknown) {
  const storefrontUrl = clean(storefrontUrlValue);
  if (!storefrontUrl) return null;

  try {
    const pageUrl = new URL(storefrontUrl).href;
    const response = await fetch(pageUrl, {
      headers: { Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
    });
    if (!response.ok) return null;

    const html = await response.text();
    const directStoreId = extractUpzeroStorefrontStoreIdFromText(html);
    if (directStoreId) return directStoreId;

    const scriptSources = extractScriptSourcesFromHtml(html, pageUrl)
      .filter((src) => src.includes("/_next/static/chunks/"))
      .slice(0, 12);

    for (const src of scriptSources) {
      const scriptResponse = await fetch(src, {
        headers: { Accept: "application/javascript,text/javascript,*/*" },
        redirect: "follow",
      }).catch(() => null);
      if (!scriptResponse?.ok) continue;
      const scriptText = await scriptResponse.text().catch(() => "");
      const scriptStoreId = extractUpzeroStorefrontStoreIdFromText(scriptText);
      if (scriptStoreId) return scriptStoreId;
    }
  } catch (_) {
    return null;
  }

  return null;
}

function bunnyStatus(value: unknown) {
  const status = Number(value);
  if (status === 4 || status === 8) return "ready";
  if (status === 5 || status === 6) return "failed";
  return "processing";
}

function playbackUrl(cdnHostname: string, videoId: string) {
  return `https://${cdnHostname.replace(/^https?:\/\//i, "").replace(/\/$/, "")}/${videoId}/playlist.m3u8`;
}

function thumbnailUrl(cdnHostname: string, videoId: string) {
  return `https://${cdnHostname.replace(/^https?:\/\//i, "").replace(/\/$/, "")}/${videoId}/thumbnail.jpg`;
}

async function readBunnyError(response: Response) {
  const body = await response.json().catch(() => null);
  if (body && typeof body.message === "string") return body.message;
  if (body && typeof body.Message === "string") return body.Message;
  return await response.text().catch(() => "bunny_request_failed");
}

async function getBunnyVideo({
  apiKey,
  libraryId,
  videoId,
}: {
  apiKey: string;
  libraryId: string;
  videoId: string;
}) {
  const response = await fetch(
    `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`,
    {
      headers: { AccessKey: apiKey },
      method: "GET",
    },
  );
  if (!response.ok) throw new Error(await readBunnyError(response));
  return (await response.json()) as BunnyVideo;
}

function getSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function findStore(
  supabase: ReturnType<typeof createClient>,
  reqUrl: URL,
) {
  const storeId =
    reqUrl.searchParams.get("store_id") ||
    reqUrl.searchParams.get("lupp_store_id") ||
    "";
  const storeSlug =
    reqUrl.searchParams.get("store_slug") ||
    reqUrl.searchParams.get("lupp_store") ||
    "";
  const externalStoreId =
    reqUrl.searchParams.get("external_store_id") ||
    reqUrl.searchParams.get("store") ||
    "";
  const provider = reqUrl.searchParams.get("provider") || "nuvemshop";
  const storeDomain = normalizedDomain(
    reqUrl.searchParams.get("store_domain") ||
      reqUrl.searchParams.get("lupp_store_domain") ||
      reqUrl.searchParams.get("domain") ||
      reqUrl.searchParams.get("hostname") ||
      "",
  );

  if (storeId) {
    const { data } = await supabase
      .from("stores")
      .select("id, slug, button_color, status, platform, url, plan_id")
      .eq("id", storeId)
      .eq("status", "active")
      .maybeSingle();
    if (data) return data;
  }

  if (storeSlug) {
    const { data } = await supabase
      .from("stores")
      .select("id, slug, button_color, status, platform, url, plan_id")
      .eq("slug", storeSlug)
      .eq("status", "active")
      .maybeSingle();
    return data;
  }

  if (!externalStoreId && storeDomain) {
    const { data: stores } = await supabase
      .from("stores")
      .select("id, slug, button_color, status, platform, url, plan_id")
      .eq("status", "active")
      .limit(250);

    const matched = (stores ?? []).find((store) => {
      const host = normalizedDomain(store.url);
      if (!host) return false;
      return host === storeDomain || host.endsWith(`.${storeDomain}`) || storeDomain.endsWith(`.${host}`);
    });

    if (matched) return matched;
  }

  if (!externalStoreId) return null;

  const { data: integration } = await supabase
    .from("integrations")
    .select("store_id")
    .eq("provider", provider)
    .eq("external_store_id", externalStoreId)
    .eq("status", "active")
    .maybeSingle();

  if (!integration?.store_id) return null;

  const { data } = await supabase
    .from("stores")
    .select("id, slug, button_color, status, platform, url, plan_id")
    .eq("id", integration.store_id)
    .eq("status", "active")
    .maybeSingle();

  return data;
}

function mappedWidgetType(type: string) {
  return type === "floating_launcher" ? "floating_video" : type;
}

function allowsHorizontalFeed(planId: unknown) {
  const normalized = clean(planId).toLowerCase();
  return ["growth", "pro", "scale"].includes(normalized);
}

function enforceWidgetPlanLimits(
  widget: Record<string, unknown> | null,
  store: Record<string, unknown>,
) {
  if (!widget || allowsHorizontalFeed(store.plan_id)) return widget;

  const settings =
    widget.settings &&
    typeof widget.settings === "object" &&
    !Array.isArray(widget.settings)
      ? (widget.settings as Record<string, unknown>)
      : {};
  const carousel =
    settings.carousel &&
    typeof settings.carousel === "object" &&
    !Array.isArray(settings.carousel)
      ? (settings.carousel as Record<string, unknown>)
      : {};

  return {
    ...widget,
    settings: {
      ...settings,
      carousel: {
        ...carousel,
        disabled_reason: "plan_widget_limit",
        enabled: false,
      },
    },
  };
}

async function hasBillingAccess(
  supabase: ReturnType<typeof createClient>,
  storeId: string,
) {
  const { data, error } = await supabase.rpc("store_has_billing_access", {
    check_store_id: storeId,
  });
  if (error) return false;
  return Boolean(data);
}

async function refreshProcessingBunnyVideos(
  supabase: ReturnType<typeof createClient>,
  storeId: string,
) {
  const libraryId = clean(Deno.env.get("BUNNY_STREAM_LIBRARY_ID"));
  const apiKey = clean(Deno.env.get("BUNNY_STREAM_API_KEY"));
  const cdnHostname = clean(Deno.env.get("BUNNY_STREAM_CDN_HOSTNAME"));
  if (!libraryId || !apiKey || !cdnHostname) return;

  const { data: processingVideos } = await supabase
    .from("videos")
    .select("id, provider_video_id")
    .eq("store_id", storeId)
    .eq("provider", "bunny")
    .eq("status", "active")
    .eq("processing_status", "processing")
    .not("provider_video_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(24);

  await Promise.allSettled(
    (processingVideos ?? []).map(async (row) => {
      const providerVideoId = clean(row.provider_video_id);
      if (!providerVideoId) return;

      const bunnyVideo = await getBunnyVideo({
        apiKey,
        libraryId,
        videoId: providerVideoId,
      });
      const processingStatus = bunnyStatus(bunnyVideo.status);
      await supabase
        .from("videos")
        .update({
          duration_seconds: bunnyVideo.length || null,
          file_size: bunnyVideo.storageSize || null,
          playback_url: playbackUrl(cdnHostname, providerVideoId),
          processing_status: processingStatus,
          thumbnail_url: thumbnailUrl(cdnHostname, providerVideoId),
          video_url: playbackUrl(cdnHostname, providerVideoId),
        })
        .eq("id", row.id)
        .eq("store_id", storeId);
    }),
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return jsonResponse({ error: "missing_server_config" }, 500);
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const storeId = String(body.store_id || "").trim();
    const eventType = String(body.event_type || "").trim();
    if (!storeId || !eventType)
      return jsonResponse({ error: "missing_event_data" }, 400);

    const { error } = await supabase.from("analytics_events").insert({
      event_type: eventType,
      metadata:
        body.metadata && typeof body.metadata === "object" ? body.metadata : {},
      product_id: body.product_id || null,
      referrer: body.referrer || null,
      session_id: body.session_id || null,
      store_id: storeId,
      url: body.url || null,
      user_agent: body.user_agent || null,
      video_id: body.video_id || null,
      visitor_id: body.visitor_id || null,
    });

    if (error) return jsonResponse({ error: "analytics_insert_failed" }, 500);
    return jsonResponse({ ok: true });
  }

  if (req.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const reqUrl = new URL(req.url);
  const mode = reqUrl.searchParams.get("mode") || "feed";
  const widgetType = mappedWidgetType(
    reqUrl.searchParams.get("widget") || "floating_video",
  );
  const store = await findStore(supabase, reqUrl);
  if (!store?.id) {
    return jsonResponse({ active: false, error: "store_not_found" }, 404);
  }

  const canShowWidget = await hasBillingAccess(supabase, store.id);
  if (!canShowWidget) {
    return jsonResponse({
      active: false,
      error: "trial_expired",
      store,
      videos: [],
      widget: null,
    });
  }

  if (mode !== "meta") {
    await refreshProcessingBunnyVideos(supabase, store.id);
  }

  const { data: widget } = await supabase
    .from("widgets")
    .select("id, type, status, settings")
    .eq("store_id", store.id)
    .eq("type", widgetType)
    .eq("status", "active")
    .maybeSingle();
  const effectiveWidget = enforceWidgetPlanLimits(widget, store);

  let videos: unknown[] = [];
  if (mode === "preview") {
    const { data } = await supabase
      .from("videos")
      .select(
        "id,title,video_url,playback_url,thumbnail_url,product_visibility_scope,product_visibility_url,is_feed_enabled,is_product_page_enabled,is_featured,sort_order,created_at,video_products(is_primary,products(id,external_id,name,description,price,compare_at_price,currency,image_url,product_url,platform,status,product_variants(id,external_id,sku,color_name,color_code,color_hex,size_name,size_code,price,compare_at_price,stock_qty,image_url,asset_id,status,metadata)))",
      )
      .eq("store_id", store.id)
      .eq("status", "active")
      .eq("processing_status", "ready")
      .or("is_feed_enabled.eq.true,is_product_page_enabled.eq.true")
      .order("is_featured", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(24);
    videos = data ?? [];
  } else if (mode !== "meta") {
    const { data } = await supabase
      .from("videos")
      .select(
        "*, video_products(is_primary, products(*, product_variants(id,external_id,sku,color_name,color_code,color_hex,size_name,size_code,price,compare_at_price,stock_qty,image_url,asset_id,status,metadata)))",
      )
      .eq("store_id", store.id)
      .eq("status", "active")
      .eq("processing_status", "ready")
      .or("is_feed_enabled.eq.true,is_product_page_enabled.eq.true")
      .order("is_featured", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    videos = data ?? [];
  }

  let upzeroStorefrontKey: string | null = null;
  let upzeroConfig: Record<string, unknown> | null = null;
  if (String(store.platform || "").toLowerCase() === "upzero") {
    const { data: integration } = await supabase
      .from("integrations")
      .select("id, external_store_id, settings")
      .eq("store_id", store.id)
      .eq("provider", "upzero")
      .eq("status", "active")
      .maybeSingle();

    if (integration?.id) {
      const settings =
        integration.settings &&
        typeof integration.settings === "object" &&
        !Array.isArray(integration.settings)
          ? (integration.settings as Record<string, unknown>)
          : {};
      const storefrontUrl = settings.storefront_url || store.url || null;
      let storefrontStoreId =
        settings.storefront_store_id ||
        settings.store_id ||
        settings.upzero_store_id ||
        null;

      if (!storefrontStoreId && storefrontUrl) {
        const discoveredStoreId =
          await discoverUpzeroStorefrontStoreId(storefrontUrl);
        if (discoveredStoreId) {
          storefrontStoreId = discoveredStoreId;
          await supabase
            .from("integrations")
            .update({
              settings: {
                ...settings,
                storefront_store_id: discoveredStoreId,
                storefront_store_id_source: "public_storefront",
              },
            })
            .eq("id", integration.id);
        }
      }

      upzeroConfig = {
        base_url: settings.base_url || null,
        external_store_id: integration.external_store_id || null,
        integration_name: settings.integration_name || null,
        last_connection_source: settings.last_connection_source || null,
        product_url_pattern: settings.product_url_pattern || null,
        storefront_store_id: storefrontStoreId,
        storefront_url: storefrontUrl,
      };
      const { data: secret } = await supabase
        .from("integration_secrets")
        .select("access_token")
        .eq("integration_id", integration.id)
        .maybeSingle();
      upzeroStorefrontKey = secret?.access_token || null;
    }
  }

  return jsonResponse({
    active: Boolean(effectiveWidget),
    mode,
    store,
    upzero_config: upzeroConfig,
    upzero_storefront_key: upzeroStorefrontKey,
    videos: videos ?? [],
    widget: effectiveWidget,
  });
});
