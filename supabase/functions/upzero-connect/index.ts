import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function normalizeBaseUrl(value: string | null | undefined) {
  const raw = String(value || "https://api.upzero.com.br")
    .trim()
    .replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(raw)) return `https://${raw}`;
  return raw;
}

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

function previewCount(payload: Record<string, unknown> | unknown[]) {
  if (Array.isArray(payload)) return payload.length;
  if (Array.isArray(payload.items)) return payload.items.length;
  if (Array.isArray(payload.data)) return payload.data.length;
  return 0;
}

async function testUpzeroEndpoint(
  url: URL,
  apiKey: string,
  source: "storefront" | "external",
) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
  });
  const details = await readJson(response);

  return {
    details,
    ok: response.ok,
    previewed: response.ok ? previewCount(details) : 0,
    source,
    status: response.status,
  };
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
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "missing_supabase_server_config" }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return jsonResponse({ error: "missing_authorization" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const storeId = String(body.store_id || "").trim();
  const apiKey = String(body.apiKey || body.api_key || "").trim();
  const baseUrl = normalizeBaseUrl(String(body.baseUrl || body.base_url || ""));
  const integrationName = String(
    body.integrationName || body.integration_name || "",
  ).trim();
  let storefrontUrl = String(body.storefrontUrl || body.storefront_url || "")
    .trim()
    .replace(/\/+$/, "");
  const productUrlPattern =
    String(
      body.productUrlPattern ||
        body.product_url_pattern ||
        "/produtos/{code}-{name_slug}",
    ).trim() || "/produtos/{code}-{name_slug}";

  if (!storeId) return jsonResponse({ error: "missing_store_id" }, 400);
  if (!apiKey) return jsonResponse({ error: "missing_upzero_api_key" }, 400);

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

  const { data: member } = await supabase
    .from("store_members")
    .select("id")
    .eq("store_id", storeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) {
    return jsonResponse({ error: "store_access_denied" }, 403);
  }

  if (!storefrontUrl) {
    const { data: store } = await supabase
      .from("stores")
      .select("url")
      .eq("id", storeId)
      .maybeSingle();
    storefrontUrl = String(store?.url || "")
      .trim()
      .replace(/\/+$/, "");
  }

  const testUrl = new URL(`${baseUrl}/v1/products`);
  testUrl.searchParams.set("limit", "1");
  testUrl.searchParams.set("card_mode", "true");
  testUrl.searchParams.set("include_variants", "false");

  const storefrontTest = await testUpzeroEndpoint(
    testUrl,
    apiKey,
    "storefront",
  );
  let successfulTest = storefrontTest.ok ? storefrontTest : null;

  if (!successfulTest) {
    const externalTestUrl = new URL(`${baseUrl}/external/v1/products`);
    externalTestUrl.searchParams.set("limit", "1");
    if (integrationName)
      externalTestUrl.searchParams.set("integration", integrationName);
    const externalTest = await testUpzeroEndpoint(
      externalTestUrl,
      apiKey,
      "external",
    );
    successfulTest = externalTest.ok ? externalTest : null;

    if (!successfulTest) {
      return jsonResponse(
        {
          attempts: [
            {
              details: storefrontTest.details,
              source: storefrontTest.source,
              status: storefrontTest.status,
            },
            {
              details: externalTest.details,
              source: externalTest.source,
              status: externalTest.status,
            },
          ],
          error: "upzero_connection_test_failed",
        },
        storefrontTest.status === 401 && externalTest.status === 401
          ? 401
          : 502,
      );
    }
  }

  const externalStoreId = `upzero:${storeId}`;
  const now = new Date().toISOString();

  const { data: integration, error: integrationError } = await supabase
    .from("integrations")
    .upsert(
      {
        connected_at: now,
        credentials: {},
        external_store_id: externalStoreId,
        provider: "upzero",
        settings: {
          base_url: baseUrl,
          connected_via: "api_key",
          integration_name: integrationName || null,
          last_connection_source: successfulTest.source,
          last_connection_test_at: now,
          product_url_pattern: productUrlPattern,
          storefront_url: storefrontUrl || null,
        },
        status: "active",
        store_id: storeId,
      },
      { onConflict: "store_id,provider" },
    )
    .select("id")
    .single();

  if (integrationError || !integration) {
    return jsonResponse({ error: "luup_integration_save_failed" }, 500);
  }

  const { error: secretError } = await supabase
    .from("integration_secrets")
    .upsert(
      {
        access_token: apiKey,
        external_store_id: externalStoreId,
        integration_id: integration.id,
        metadata: {
          base_url: baseUrl,
          integration_name: integrationName || null,
          source: successfulTest.source,
        },
        provider: "upzero",
        scope: "storefront:products external:products",
        token_type: "api_key",
      },
      { onConflict: "integration_id" },
    );

  if (secretError) {
    return jsonResponse({ error: "luup_integration_secret_save_failed" }, 500);
  }

  await supabase
    .from("stores")
    .update({ platform: "upzero" })
    .eq("id", storeId);

  return jsonResponse({
    ok: true,
    products_previewed: successfulTest.previewed,
    source: successfulTest.source,
  });
});
