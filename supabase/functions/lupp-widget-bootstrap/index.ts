import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function getSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function findStore(supabase: ReturnType<typeof createClient>, reqUrl: URL) {
  const storeSlug = reqUrl.searchParams.get("store_slug") || reqUrl.searchParams.get("lupp_store") || "";
  const externalStoreId = reqUrl.searchParams.get("external_store_id") || reqUrl.searchParams.get("store") || "";
  const provider = reqUrl.searchParams.get("provider") || "nuvemshop";

  if (storeSlug) {
    const { data } = await supabase
      .from("stores")
      .select("id, slug, button_color, status")
      .eq("slug", storeSlug)
      .eq("status", "active")
      .maybeSingle();
    return data;
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
    .select("id, slug, button_color, status")
    .eq("id", integration.store_id)
    .eq("status", "active")
    .maybeSingle();

  return data;
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
    if (!storeId || !eventType) return jsonResponse({ error: "missing_event_data" }, 400);

    const { error } = await supabase.from("analytics_events").insert({
      event_type: eventType,
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
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
  const widgetType = reqUrl.searchParams.get("widget") || "floating_video";
  const store = await findStore(supabase, reqUrl);
  if (!store?.id) {
    return jsonResponse({ active: false, error: "store_not_found" }, 404);
  }

  const { data: widget } = await supabase
    .from("widgets")
    .select("id, type, status, settings")
    .eq("store_id", store.id)
    .eq("type", widgetType)
    .eq("status", "active")
    .maybeSingle();

  const { data: videos } = await supabase
    .from("videos")
    .select("*, video_products(is_primary, products(id, external_id, product_url))")
    .eq("store_id", store.id)
    .eq("status", "active")
    .eq("is_feed_enabled", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  return jsonResponse({
    active: Boolean(widget),
    store,
    videos: videos ?? [],
    widget,
  });
});
