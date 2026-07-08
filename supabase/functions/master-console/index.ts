import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

type JsonRecord = Record<string, unknown>;

function jsonResponse(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthStartIso() {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function adminEmails() {
  return new Set(
    (Deno.env.get("MASTER_ADMIN_EMAILS") || "playluup@gmail.com")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function getSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function requireMasterAdmin(
  supabase: ReturnType<typeof createClient>,
  req: Request,
) {
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return { error: "missing_authorization" };

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(jwt);

  if (error || !user?.email) return { error: "invalid_user" };

  const email = user.email.toLowerCase();
  if (!adminEmails().has(email)) return { error: "master_access_denied" };

  return { user: { email, id: user.id } };
}

function latestByStore<T extends { created_at?: string; store_id: string }>(
  rows: T[],
) {
  const map = new Map<string, T>();
  for (const row of rows) {
    const current = map.get(row.store_id);
    if (
      !current ||
      new Date(row.created_at || 0).getTime() >
        new Date(current.created_at || 0).getTime()
    ) {
      map.set(row.store_id, row);
    }
  }
  return map;
}

function countByStore<T extends { store_id: string }>(
  rows: T[],
  predicate?: (row: T) => boolean,
) {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (predicate && !predicate(row)) continue;
    map.set(row.store_id, (map.get(row.store_id) || 0) + 1);
  }
  return map;
}

function groupByStore<T extends { store_id: string }>(rows: T[]) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const current = map.get(row.store_id) || [];
    current.push(row);
    map.set(row.store_id, current);
  }
  return map;
}

function planRevenue(
  plan: { price_monthly?: number | null } | undefined,
  subscription: {
    discount_amount?: number | null;
    discount_percent?: number | null;
    status?: string | null;
  } | null,
) {
  if (!subscription || subscription.status !== "active") return 0;
  const price = asNumber(plan?.price_monthly);
  const amountOff = asNumber(subscription.discount_amount);
  const percentOff = asNumber(subscription.discount_percent);
  const discount = amountOff || price * (percentOff / 100);
  return Math.max(0, price - discount);
}

async function getSnapshot(supabase: ReturnType<typeof createClient>) {
  const since = monthStartIso();

  const [
    storesResult,
    profilesResult,
    plansResult,
    subscriptionsResult,
    integrationsResult,
    videosResult,
    productsResult,
    widgetsResult,
    eventsResult,
    auditResult,
  ] = await Promise.all([
    supabase
      .from("stores")
      .select(
        "id, owner_id, name, slug, url, platform, status, plan_id, logo_url, trial_started_at, trial_ends_at, created_at, updated_at",
      )
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, name, email"),
    supabase.from("plans").select("*"),
    supabase.from("subscriptions").select("*").order("created_at", {
      ascending: false,
    }),
    supabase
      .from("integrations")
      .select(
        "id, store_id, provider, status, external_store_id, connected_at, last_sync_at, settings",
      ),
    supabase
      .from("videos")
      .select("id, store_id, status, processing_status, created_at"),
    supabase.from("products").select("id, store_id, status"),
    supabase.from("widgets").select("id, store_id, status"),
    supabase
      .from("analytics_events")
      .select("store_id, event_type")
      .gte("created_at", since)
      .in("event_type", [
        "video_view",
        "widget_view",
        "feed_open",
        "product_click",
        "add_to_cart_click",
        "share_click",
      ]),
    supabase
      .from("master_console_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const firstError =
    storesResult.error ||
    profilesResult.error ||
    plansResult.error ||
    subscriptionsResult.error ||
    integrationsResult.error ||
    videosResult.error ||
    productsResult.error ||
    widgetsResult.error ||
    eventsResult.error ||
    auditResult.error;
  if (firstError) throw firstError;

  const stores = storesResult.data || [];
  const profilesById = new Map(
    (profilesResult.data || []).map((profile) => [profile.id, profile]),
  );
  const plansById = new Map((plansResult.data || []).map((plan) => [plan.id, plan]));
  const latestSubscriptionByStore = latestByStore(
    subscriptionsResult.data || [],
  );
  const integrationsByStore = groupByStore(integrationsResult.data || []);
  const activeVideosByStore = countByStore(
    videosResult.data || [],
    (video) => video.status === "active",
  );
  const processingVideosByStore = countByStore(
    videosResult.data || [],
    (video) => video.processing_status === "processing",
  );
  const productsByStore = countByStore(
    productsResult.data || [],
    (product) => product.status === "active",
  );
  const widgetsByStore = countByStore(
    widgetsResult.data || [],
    (widget) => widget.status === "active",
  );
  const events = eventsResult.data || [];
  const eventCounts = {
    addToCart: countByStore(events, (event) => event.event_type === "add_to_cart_click"),
    feedOpen: countByStore(events, (event) => event.event_type === "feed_open"),
    productClick: countByStore(events, (event) => event.event_type === "product_click"),
    share: countByStore(events, (event) => event.event_type === "share_click"),
    videoView: countByStore(events, (event) => event.event_type === "video_view"),
    widgetView: countByStore(events, (event) => event.event_type === "widget_view"),
  };

  const now = Date.now();
  const rows = stores.map((store) => {
    const subscription = latestSubscriptionByStore.get(store.id) || null;
    const planId = clean(subscription?.plan_id || store.plan_id || "start");
    const plan = plansById.get(planId);
    const integrations = integrationsByStore.get(store.id) || [];
    const activeIntegrations = integrations.filter(
      (integration) => integration.status === "active",
    );
    const trialEndsAt = store.trial_ends_at || subscription?.current_period_end || null;
    const trialTime = trialEndsAt ? new Date(trialEndsAt).getTime() : 0;
    const trialDaysLeft = trialTime
      ? Math.ceil(Math.max(0, trialTime - now) / 86_400_000)
      : null;
    const mrr = planRevenue(plan, subscription);
    const owner = profilesById.get(store.owner_id);

    return {
      active_integrations: activeIntegrations.map((integration) => ({
        external_store_id: integration.external_store_id,
        last_sync_at: integration.last_sync_at,
        provider: integration.provider,
        status: integration.status,
      })),
      active_videos: activeVideosByStore.get(store.id) || 0,
      active_widgets: widgetsByStore.get(store.id) || 0,
      add_to_cart_month: eventCounts.addToCart.get(store.id) || 0,
      created_at: store.created_at,
      feed_opens_month: eventCounts.feedOpen.get(store.id) || 0,
      id: store.id,
      logo_url: store.logo_url,
      mrr,
      name: store.name,
      owner_email: owner?.email || null,
      owner_name: owner?.name || null,
      plan_id: planId,
      plan_name: plan?.name || planId,
      platform: store.platform,
      processing_videos: processingVideosByStore.get(store.id) || 0,
      product_clicks_month: eventCounts.productClick.get(store.id) || 0,
      products: productsByStore.get(store.id) || 0,
      shares_month: eventCounts.share.get(store.id) || 0,
      slug: store.slug,
      status: store.status,
      subscription_id: subscription?.id || null,
      subscription_status: subscription?.status || null,
      trial_days_left: trialDaysLeft,
      trial_ends_at: trialEndsAt,
      updated_at: store.updated_at,
      url: store.url,
      video_views_month: eventCounts.videoView.get(store.id) || 0,
      widget_views_month: eventCounts.widgetView.get(store.id) || 0,
    };
  });

  const metrics = rows.reduce(
    (acc, row) => {
      acc.mrr += row.mrr;
      acc.arr = acc.mrr * 12;
      acc.activeStores += row.status === "active" ? 1 : 0;
      acc.pausedStores += row.status === "paused" ? 1 : 0;
      acc.paidStores += row.subscription_status === "active" ? 1 : 0;
      acc.trialStores += row.subscription_status === "trialing" ? 1 : 0;
      acc.trialsEndingSoon +=
        row.subscription_status === "trialing" &&
        row.trial_days_left !== null &&
        row.trial_days_left <= 3
          ? 1
          : 0;
      acc.expiredTrials +=
        row.subscription_status === "trialing" &&
        row.trial_days_left !== null &&
        row.trial_days_left <= 0
          ? 1
          : 0;
      acc.activeVideos += row.active_videos;
      acc.processingVideos += row.processing_videos;
      acc.monthViews += row.video_views_month;
      acc.monthAddToCart += row.add_to_cart_month;
      return acc;
    },
    {
      activeStores: 0,
      activeVideos: 0,
      arr: 0,
      expiredTrials: 0,
      monthAddToCart: 0,
      monthViews: 0,
      mrr: 0,
      paidStores: 0,
      pausedStores: 0,
      processingVideos: 0,
      trialStores: 0,
      trialsEndingSoon: 0,
    },
  );

  return {
    audit_logs: auditResult.data || [],
    generated_at: new Date().toISOString(),
    metrics,
    stores: rows,
  };
}

async function auditAction({
  action,
  admin,
  payload,
  result,
  storeId,
  supabase,
}: {
  action: string;
  admin: { email: string; id: string };
  payload: JsonRecord;
  result: JsonRecord;
  storeId: string | null;
  supabase: ReturnType<typeof createClient>;
}) {
  await supabase.from("master_console_audit_logs").insert({
    action,
    admin_email: admin.email,
    admin_user_id: admin.id,
    payload,
    result,
    target_store_id: storeId,
  });
}

async function runAction({
  action,
  admin,
  body,
  supabase,
}: {
  action: string;
  admin: { email: string; id: string };
  body: JsonRecord;
  supabase: ReturnType<typeof createClient>;
}) {
  const storeId = clean(body.store_id);
  if (!storeId) return jsonResponse({ error: "missing_store_id" }, 400);

  let result: JsonRecord = {};

  if (action === "pause_store" || action === "activate_store") {
    const nextStatus = action === "pause_store" ? "paused" : "active";
    const { data, error } = await supabase
      .from("stores")
      .update({ status: nextStatus })
      .eq("id", storeId)
      .select("id, status")
      .maybeSingle();
    if (error) throw error;
    result = { store: data };
  } else if (action === "extend_trial") {
    const days = Math.max(1, Math.min(Number(body.days) || 7, 90));
    const currentTrialEnd = clean(body.current_trial_ends_at);
    const base = currentTrialEnd && new Date(currentTrialEnd).getTime() > Date.now()
      ? new Date(currentTrialEnd)
      : new Date();
    base.setDate(base.getDate() + days);
    const trialEndsAt = base.toISOString();

    const { data, error } = await supabase
      .from("stores")
      .update({ trial_ends_at: trialEndsAt })
      .eq("id", storeId)
      .select("id, trial_ends_at")
      .maybeSingle();
    if (error) throw error;

    await supabase
      .from("subscriptions")
      .update({ current_period_end: trialEndsAt, status: "trialing" })
      .eq("store_id", storeId)
      .eq("status", "trialing");

    result = { store: data };
  } else if (action === "set_plan") {
    const planId = clean(body.plan_id);
    if (!planId) return jsonResponse({ error: "missing_plan_id" }, 400);

    const { data: plan } = await supabase
      .from("plans")
      .select("id")
      .eq("id", planId)
      .maybeSingle();
    if (!plan?.id) return jsonResponse({ error: "plan_not_found" }, 404);

    const { data, error } = await supabase
      .from("stores")
      .update({ plan_id: planId })
      .eq("id", storeId)
      .select("id, plan_id")
      .maybeSingle();
    if (error) throw error;

    const { data: subscriptions } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(1);
    const subscriptionId = subscriptions?.[0]?.id;
    if (subscriptionId) {
      await supabase
        .from("subscriptions")
        .update({ plan_id: planId })
        .eq("id", subscriptionId);
    }

    result = { store: data, subscription_id: subscriptionId || null };
  } else {
    return jsonResponse({ error: "unknown_action" }, 400);
  }

  await auditAction({
    action,
    admin,
    payload: body,
    result,
    storeId,
    supabase,
  });

  return jsonResponse({ ok: true, result });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return jsonResponse({ error: "missing_server_config" }, 500);
  }

  const adminResult = await requireMasterAdmin(supabase, req);
  if ("error" in adminResult) {
    return jsonResponse({ error: adminResult.error }, adminResult.error === "master_access_denied" ? 403 : 401);
  }

  try {
    if (req.method === "GET") {
      return jsonResponse(await getSnapshot(supabase));
    }

    if (req.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, 405);
    }

    const body = (await req.json().catch(() => ({}))) as JsonRecord;
    const action = clean(body.action || "snapshot");
    if (action === "snapshot") {
      return jsonResponse(await getSnapshot(supabase));
    }

    return await runAction({
      action,
      admin: adminResult.user,
      body,
      supabase,
    });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "master_console_failed" },
      500,
    );
  }
});
