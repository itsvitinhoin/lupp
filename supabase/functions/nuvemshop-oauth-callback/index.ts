import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

type NuvemshopTokenResponse = {
  access_token?: string;
  scope?: string;
  token_type?: string;
  user_id?: number | string;
};

function base64UrlDecode(input: string) {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function base64UrlEncode(input: ArrayBuffer) {
  const bytes = new Uint8Array(input);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function verifyState(state: string, secret: string) {
  const [encodedPayload, receivedSignature] = state.split(".");
  if (!encodedPayload || !receivedSignature) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encodedPayload));
  const expectedSignature = base64UrlEncode(signature);
  if (expectedSignature !== receivedSignature) return null;

  const payload = JSON.parse(base64UrlDecode(encodedPayload)) as {
    iat?: number;
    return_to?: string;
    store_id?: string;
    user_id?: string;
  };

  if (!payload.store_id || !payload.user_id) return null;
  if (payload.iat && Date.now() / 1000 - payload.iat > 60 * 30) return null;
  return payload;
}

function redirectTo(url: string, params: Record<string, string>) {
  const nextUrl = new URL(url);
  Object.entries(params).forEach(([key, value]) => nextUrl.searchParams.set(key, value));
  return Response.redirect(nextUrl.toString(), 302);
}

Deno.serve(async (req) => {
  const reqUrl = new URL(req.url);
  const code = reqUrl.searchParams.get("code");
  const state = reqUrl.searchParams.get("state");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const appId = Deno.env.get("NUVEMSHOP_CLIENT_ID") || Deno.env.get("NUVEMSHOP_APP_ID") || "34355";
  const clientSecret = Deno.env.get("NUVEMSHOP_CLIENT_SECRET");
  const stateSecret = Deno.env.get("NUVEMSHOP_STATE_SECRET") || serviceRoleKey;
  const appUrl = Deno.env.get("LUPP_APP_URL") || "https://lupp-lupp.vercel.app";
  const fallbackReturnTo = `${appUrl}/app/integrations`;

  if (!supabaseUrl || !serviceRoleKey || !clientSecret || !stateSecret) {
    return redirectTo(fallbackReturnTo, {
      error: "missing_nuvemshop_server_config",
      provider: "nuvemshop",
    });
  }

  if (!code || !state) {
    return redirectTo(fallbackReturnTo, {
      error: "missing_oauth_code_or_state",
      provider: "nuvemshop",
    });
  }

  const payload = await verifyState(state, stateSecret).catch(() => null);
  if (!payload) {
    return redirectTo(fallbackReturnTo, {
      error: "invalid_oauth_state",
      provider: "nuvemshop",
    });
  }

  const returnTo = payload.return_to || fallbackReturnTo;
  const tokenResponse = await fetch("https://www.tiendanube.com/apps/authorize/token", {
    body: JSON.stringify({
      client_id: appId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  const tokenData = (await tokenResponse.json().catch(() => ({}))) as NuvemshopTokenResponse;
  if (!tokenResponse.ok || !tokenData.access_token || !tokenData.user_id) {
    return redirectTo(returnTo, {
      error: "nuvemshop_token_exchange_failed",
      provider: "nuvemshop",
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const externalStoreId = String(tokenData.user_id);
  const now = new Date().toISOString();
  const { data: integration, error: integrationError } = await supabase
    .from("integrations")
    .upsert(
      {
        connected_at: now,
        credentials: {
          scope: tokenData.scope || null,
          token_type: tokenData.token_type || "bearer",
        },
        external_store_id: externalStoreId,
        provider: "nuvemshop",
        settings: {
          app_id: appId,
          connected_via: "oauth",
          nuvemshop_store_id: externalStoreId,
        },
        status: "active",
        store_id: payload.store_id,
      },
      { onConflict: "store_id,provider" },
    )
    .select("id")
    .single();

  if (integrationError || !integration) {
    return redirectTo(returnTo, {
      error: "luup_integration_save_failed",
      provider: "nuvemshop",
    });
  }

  const { error: secretError } = await supabase.from("integration_secrets").upsert(
    {
      access_token: tokenData.access_token,
      external_store_id: externalStoreId,
      integration_id: integration.id,
      metadata: { app_id: appId },
      provider: "nuvemshop",
      scope: tokenData.scope || null,
      token_type: tokenData.token_type || "bearer",
    },
    { onConflict: "integration_id" },
  );

  if (secretError) {
    return redirectTo(returnTo, {
      error: "luup_integration_secret_save_failed",
      provider: "nuvemshop",
    });
  }

  await supabase
    .from("stores")
    .update({ platform: "nuvemshop" })
    .eq("id", payload.store_id);

  return redirectTo(returnTo, {
    connected: "nuvemshop",
    provider: "nuvemshop",
  });
});
