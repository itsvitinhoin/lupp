import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

type ScriptApiResponse = {
  id?: number | string;
  result?: Array<{ id?: number | string; [key: string]: unknown }>;
  [key: string]: unknown;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function normalizeScriptId(scriptId: string) {
  const parsed = Number(scriptId);
  return Number.isFinite(parsed) ? parsed : scriptId;
}

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as ScriptApiResponse;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const scriptId = Deno.env.get("NUVEMSHOP_SCRIPT_ID");
  const appUrl = Deno.env.get("LUPP_APP_URL") || "https://lupp-lupp.vercel.app";
  const appUserAgent = Deno.env.get("NUVEMSHOP_USER_AGENT") || "Luup (suporte@luup.app)";

  if (!supabaseUrl || !serviceRoleKey || !supabaseAnonKey) {
    return jsonResponse({ error: "missing_supabase_server_config" }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return jsonResponse({ error: "missing_authorization" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const storeId = String(body.store_id || "").trim();
  if (!storeId) {
    return jsonResponse({ error: "missing_store_id" }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(jwt);

  if (userError || !user) {
    return jsonResponse({ error: "invalid_user" }, 401);
  }

  if (!scriptId) {
    return jsonResponse({ error: "missing_nuvemshop_script_id" }, 500);
  }

  const { data: member } = await supabase
    .from("store_members")
    .select("id")
    .eq("store_id", storeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) {
    return jsonResponse({ error: "store_access_denied" }, 403);
  }

  const { data: store } = await supabase
    .from("stores")
    .select("id, slug")
    .eq("id", storeId)
    .maybeSingle();

  if (!store?.slug) {
    return jsonResponse({ error: "store_not_found" }, 404);
  }

  const { data: integration } = await supabase
    .from("integrations")
    .select("id, external_store_id, settings")
    .eq("store_id", storeId)
    .eq("provider", "nuvemshop")
    .eq("status", "active")
    .maybeSingle();

  if (!integration?.id || !integration.external_store_id) {
    return jsonResponse({ error: "nuvemshop_not_connected" }, 400);
  }

  const { data: secret } = await supabase
    .from("integration_secrets")
    .select("access_token")
    .eq("integration_id", integration.id)
    .maybeSingle();

  if (!secret?.access_token) {
    return jsonResponse({ error: "missing_nuvemshop_access_token" }, 400);
  }

  const externalStoreId = String(integration.external_store_id);
  const scriptApiBase = `https://api.tiendanube.com/2025-03/${externalStoreId}/scripts`;
  const scriptApiHeaders = {
    Authorization: `Bearer ${secret.access_token}`,
    "Content-Type": "application/json",
    "User-Agent": appUserAgent,
  };
  const apiScriptId = normalizeScriptId(scriptId);
  const queryParams = {
    lupp_store: store.slug,
    lupp_supabase_url: supabaseUrl,
    lupp_supabase_key: supabaseAnonKey,
    lupp_url: appUrl,
    lupp_widget: "floating_launcher",
    lupp_require_active: "true",
  };
  const payload = {
    query_params: JSON.stringify(queryParams),
    script_id: apiScriptId,
  };

  const listResponse = await fetch(`${scriptApiBase}?page=1&per_page=100`, {
    headers: scriptApiHeaders,
  });

  if (!listResponse.ok && ![401, 403].includes(listResponse.status)) {
    const details = await listResponse.text().catch(() => "");
    return jsonResponse({ details: details.slice(0, 500), error: "nuvemshop_script_list_failed", status: listResponse.status }, 502);
  }

  if ([401, 403].includes(listResponse.status)) {
    return jsonResponse({ error: "nuvemshop_scripts_permission_missing", status: listResponse.status }, 403);
  }

  const listData = await readJson(listResponse);
  const scripts = Array.isArray(listData.result) ? listData.result : [];
  const existing = scripts.find((script) => String(script.id) === String(scriptId));
  if (existing && existing.is_auto_install) {
    const integrationSettings =
      integration.settings && typeof integration.settings === "object" && !Array.isArray(integration.settings)
        ? integration.settings
        : {};

    await supabase
      .from("integrations")
      .update({
        settings: {
          ...integrationSettings,
          script_install: {
            auto_installed: true,
            installed_at: new Date().toISOString(),
            script_id: scriptId,
            source: "nuvemshop_auto_install",
            status: existing.status || null,
          },
        },
      })
      .eq("id", integration.id);

    return jsonResponse({
      auto_installed: true,
      installed: true,
      ok: true,
      script: existing,
      script_id: scriptId,
    });
  }

  const method = existing ? "PUT" : "POST";
  const endpoint = existing ? `${scriptApiBase}/${scriptId}` : scriptApiBase;
  let installResponse = await fetch(endpoint, {
    body: JSON.stringify(payload),
    headers: scriptApiHeaders,
    method,
  });

  if (!installResponse.ok && installResponse.status === 409) {
    installResponse = await fetch(`${scriptApiBase}/${scriptId}`, {
      body: JSON.stringify(payload),
      headers: scriptApiHeaders,
      method: "PUT",
    });
  }

  const installData = await readJson(installResponse);
  if (!installResponse.ok) {
    return jsonResponse(
      {
        details: installData,
        error: [401, 403].includes(installResponse.status)
          ? "nuvemshop_scripts_permission_missing"
          : "nuvemshop_script_install_failed",
        status: installResponse.status,
      },
      [401, 403].includes(installResponse.status) ? 403 : 502,
    );
  }

  const integrationSettings =
    integration.settings && typeof integration.settings === "object" && !Array.isArray(integration.settings)
      ? integration.settings
      : {};

  await supabase
    .from("integrations")
    .update({
      settings: {
        ...integrationSettings,
        script_install: {
          installed_at: new Date().toISOString(),
          script_id: scriptId,
          source: "nuvemshop_public_api",
        },
      },
    })
    .eq("id", integration.id);

  return jsonResponse({
    installed: true,
    method,
    ok: true,
    script: installData,
    script_id: scriptId,
  });
});
