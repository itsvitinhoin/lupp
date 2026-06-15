import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

function base64UrlEncode(input: string | ArrayBuffer) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signState(payload: Record<string, unknown>, secret: string) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encodedPayload));
  return `${encodedPayload}.${base64UrlEncode(signature)}`;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
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
  const appId = Deno.env.get("NUVEMSHOP_CLIENT_ID") || Deno.env.get("NUVEMSHOP_APP_ID") || "34355";
  const stateSecret = Deno.env.get("NUVEMSHOP_STATE_SECRET") || serviceRoleKey;
  const appUrl = Deno.env.get("LUPP_APP_URL") || "https://lupp-lupp.vercel.app";

  if (!supabaseUrl || !serviceRoleKey || !stateSecret) {
    return jsonResponse({ error: "missing_server_config" }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return jsonResponse({ error: "missing_authorization" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const storeId = String(body.store_id || "").trim();
  const returnTo = String(body.return_to || `${appUrl}/app/integrations`).trim();

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

  const { data: member, error: memberError } = await supabase
    .from("store_members")
    .select("id")
    .eq("store_id", storeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberError || !member) {
    return jsonResponse({ error: "store_access_denied" }, 403);
  }

  const state = await signState(
    {
      iat: Math.floor(Date.now() / 1000),
      return_to: returnTo,
      store_id: storeId,
      user_id: user.id,
    },
    stateSecret,
  );

  const authorizeUrl = new URL(`https://www.tiendanube.com/apps/${appId}/authorize`);
  authorizeUrl.searchParams.set("state", state);

  return jsonResponse({ authorize_url: authorizeUrl.toString() });
});
