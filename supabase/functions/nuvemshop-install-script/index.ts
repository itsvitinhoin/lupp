import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

type ScriptRecord = {
  id?: number | string;
  script_id?: number | string;
  handle?: string;
  name?: string;
  title?: string;
  is_auto_install?: boolean;
  status?: string;
  [key: string]: unknown;
};

type ScriptApiResponse =
  | ScriptRecord[]
  | {
      id?: number | string;
      result?: ScriptRecord[];
      scripts?: ScriptRecord[];
      data?: ScriptRecord[];
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

function scriptList(value: ScriptApiResponse): ScriptRecord[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.result)) return value.result;
  if (Array.isArray(value.scripts)) return value.scripts;
  if (Array.isArray(value.data)) return value.data;
  return [];
}

function externalMessage(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(externalMessage).filter(Boolean).join(" | ") || null;
  }
  if (typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const direct =
    record.message ||
    record.error_description ||
    record.error ||
    record.reason ||
    record.description;
  if (typeof direct === "string") return direct;

  return (
    externalMessage(record.errors) ||
    externalMessage(record.details) ||
    externalMessage(record.result)
  );
}

function publicScriptSnapshot(script: ScriptRecord | null | undefined) {
  if (!script) return null;
  return {
    handle: script.handle || null,
    id: script.id || null,
    is_auto_install: script.is_auto_install || false,
    name: script.name || script.title || null,
    script_id: script.script_id || null,
    status: script.status || null,
  };
}

function isLuupScript(script: ScriptRecord, scriptId: string) {
  const handle = String(script.handle || "").toLowerCase();
  const name = String(script.name || script.title || "").toLowerCase();
  return (
    String(script.id) === String(scriptId) ||
    String(script.script_id) === String(scriptId) ||
    handle === "lupp" ||
    handle === "luup-video-experience" ||
    name.includes("luup video experience")
  );
}

async function verifyLuupScript(
  scriptApiBase: string,
  headers: Record<string, string>,
  scriptId: string,
) {
  const response = await fetch(`${scriptApiBase}?page=1&per_page=100`, {
    headers,
  });
  if (!response.ok) {
    return { script: null, status: response.status, verified: false };
  }
  const scripts = scriptList(await readJson(response));
  const script = scripts.find((item) => isLuupScript(item, scriptId)) || null;
  return { script, status: response.status, verified: Boolean(script) };
}

async function tryInstallScript(
  endpoint: string,
  headers: Record<string, string>,
  method: "POST" | "PUT",
  payloads: Record<string, unknown>[],
) {
  const attempts: Array<{
    body: ScriptApiResponse;
    message: string | null;
    ok: boolean;
    payload_name: string;
    status: number;
  }> = [];

  for (const payload of payloads) {
    const payloadName = String(payload.__name || "payload");
    const { __name: _name, ...requestPayload } = payload;
    const response = await fetch(endpoint, {
      body: JSON.stringify(requestPayload),
      headers,
      method,
    });
    const body = await readJson(response);
    const message = externalMessage(body);
    attempts.push({
      body,
      message,
      ok: response.ok,
      payload_name: payloadName,
      status: response.status,
    });
    if (response.ok) {
      return {
        attempts,
        body,
        message,
        ok: true,
        payload_name: payloadName,
        status: response.status,
      };
    }
  }

  const last = attempts[attempts.length - 1];
  return {
    attempts,
    body: last?.body || {},
    message: last?.message || null,
    ok: false,
    payload_name: last?.payload_name || "payload",
    status: last?.status || 0,
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
  const scriptId = Deno.env.get("NUVEMSHOP_SCRIPT_ID");
  const scriptAutoInstall = (Deno.env.get("NUVEMSHOP_SCRIPT_AUTO_INSTALL") || "true") !== "false";
  const appUrl = Deno.env.get("LUPP_APP_URL") || "https://www.playluup.com.br";
  const appUserAgent = Deno.env.get("NUVEMSHOP_USER_AGENT") || "Luup (suporte@luup.app)";

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

  if (!scriptId && !scriptAutoInstall) {
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
    .select("id, slug, url")
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
  const queryParams = {
    external_store_id: externalStoreId,
    lupp_external_store_id: externalStoreId,
    lupp_store_domain: store.url || "",
    lupp_store: store.slug,
    lupp_supabase_url: supabaseUrl,
    lupp_url: appUrl,
    lupp_widget: "floating_launcher",
    lupp_require_active: "true",
  };

  const integrationSettings =
    integration.settings && typeof integration.settings === "object" && !Array.isArray(integration.settings)
      ? integration.settings
      : {};

  // Auto-install mode no longer returns a blind success: the flow below
  // always consults GET /scripts so the admin sees whether Nuvemshop is
  // actually serving the Luup script, and refreshes its query params.
  const autoInstallMode = scriptAutoInstall && !scriptId;

  async function saveScriptInstall(record: Record<string, unknown>) {
    await supabase
      .from("integrations")
      .update({
        settings: {
          ...integrationSettings,
          script_install: {
            auto_installed: autoInstallMode,
            external_store_id: externalStoreId,
            installed_at: new Date().toISOString(),
            query_params: queryParams,
            script_id: scriptId || "nuvemshop-auto-install",
            ...record,
          },
        },
      })
      .eq("id", integration.id);
  }

  const scriptApiBase = `https://api.tiendanube.com/2025-03/${externalStoreId}/scripts`;
  const scriptApiHeaders = {
    Authorization: `Bearer ${secret.access_token}`,
    "Content-Type": "application/json",
    "User-Agent": appUserAgent,
  };
  const scriptIdForApi = scriptId || "";
  const apiScriptId = normalizeScriptId(scriptIdForApi);
  const payloadShapes: Array<Record<string, unknown>> = [
    { __name: "query_params_object", query_params: queryParams },
    { __name: "query_params_json", query_params: JSON.stringify(queryParams) },
    { __name: "params_object", params: queryParams },
  ];
  // Only reference a portal script id when one is configured; PUTs on an
  // existing installation must not send an empty/zero script_id.
  const payloads = payloadShapes.map((shape) =>
    scriptIdForApi ? { ...shape, script_id: apiScriptId } : shape,
  );

  const listResponse = await fetch(`${scriptApiBase}?page=1&per_page=100`, {
    headers: scriptApiHeaders,
  });

  if (!listResponse.ok) {
    const permissionMissing = [401, 403].includes(listResponse.status);
    if (autoInstallMode) {
      // Cannot verify what Nuvemshop serves; be explicit instead of
      // pretending the install is confirmed.
      await saveScriptInstall({
        source: "nuvemshop_app_auto_install",
        status: "auto_install_unverified",
        verified: false,
        warning: permissionMissing
          ? "nuvemshop_scripts_permission_missing"
          : "nuvemshop_script_list_failed",
        warning_status: listResponse.status,
      });
      return jsonResponse({
        auto_installed: true,
        installed: true,
        method: "AUTO_INSTALL_UNVERIFIED",
        ok: true,
        script_id: "nuvemshop-auto-install",
        verified: false,
        warning: permissionMissing
          ? "nuvemshop_scripts_permission_missing"
          : "nuvemshop_script_list_failed",
        warning_status: listResponse.status,
        message:
          "Nao foi possivel confirmar na API da Nuvemshop se o script do app esta ativo. Verifique a vitrine ou as permissoes do app (write_scripts).",
      });
    }
    if (permissionMissing) {
      return jsonResponse({ error: "nuvemshop_scripts_permission_missing", status: listResponse.status }, 403);
    }
    const details = await listResponse.text().catch(() => "");
    return jsonResponse({ details: details.slice(0, 500), error: "nuvemshop_script_list_failed", status: listResponse.status }, 502);
  }

  const listData = await readJson(listResponse);
  const scripts = scriptList(listData);
  const existing = scripts.find((script) => isLuupScript(script, scriptIdForApi));

  if (autoInstallMode && !existing) {
    // The app should auto-inject its script, but Nuvemshop reports none
    // installed for this store — surface the exact state to the admin.
    await saveScriptInstall({
      source: "nuvemshop_app_auto_install",
      status: "auto_install_not_confirmed",
      verified: false,
    });
    return jsonResponse(
      {
        auto_installed: false,
        error: "nuvemshop_script_install_not_confirmed",
        installed: false,
        list_script_count: scripts.length,
        method: "AUTO_INSTALL_NOT_CONFIRMED",
        ok: false,
        pending_manual_install: true,
        verified: false,
        message:
          "A Nuvemshop nao registrou o script do app nesta loja. Confira se o script esta aprovado e ativo no Portal de Parceiros, ou reinstale o app na loja.",
      },
      409,
    );
  }

  const method = existing ? "PUT" : "POST";
  const installationId = existing?.id ? String(existing.id) : scriptIdForApi;
  const endpoint = existing ? `${scriptApiBase}/${installationId}` : scriptApiBase;
  let installResult = await tryInstallScript(endpoint, scriptApiHeaders, method, payloads);

  if (!installResult.ok && installResult.status === 409 && scriptIdForApi) {
    const conflictResult = await tryInstallScript(`${scriptApiBase}/${scriptIdForApi}`, scriptApiHeaders, "PUT", payloads);
    installResult = {
      ...conflictResult,
      attempts: [...installResult.attempts, ...conflictResult.attempts],
    };
  }

  const installData = installResult.body;
  if (!installResult.ok) {
    const message = installResult.message;

    if (autoInstallMode && existing) {
      // The auto-injected script is live; only the query-params refresh
      // failed. The loader has config fallbacks, so report installed but
      // flag the stale config.
      await saveScriptInstall({
        installation_id: String(existing.id || "nuvemshop-auto-install"),
        source: "nuvemshop_app_auto_install",
        status: "active_query_params_refresh_failed",
        verified: true,
        warning: message || "nuvemshop_script_update_failed",
        warning_status: installResult.status,
      });

      return jsonResponse({
        auto_installed: true,
        existing_script: publicScriptSnapshot(existing),
        installed: true,
        install_attempts: installResult.attempts.map((attempt) => ({
          message: attempt.message,
          ok: attempt.ok,
          payload_name: attempt.payload_name,
          status: attempt.status,
        })),
        method: `${method}_QUERY_PARAMS_REFRESH_FAILED`,
        ok: true,
        script_id: String(existing.id || "nuvemshop-auto-install"),
        verified: true,
        warning: message || "nuvemshop_script_update_failed",
        warning_status: installResult.status,
        message:
          "O script do app esta ativo na loja, mas a Nuvemshop nao aceitou a atualizacao dos parametros de configuracao.",
      });
    }

    return jsonResponse(
      {
        details: installData,
        error: [401, 403].includes(installResult.status)
          ? "nuvemshop_scripts_permission_missing"
          : "nuvemshop_script_install_failed",
        existing_script: publicScriptSnapshot(existing),
        install_attempts: installResult.attempts.map((attempt) => ({
          message: attempt.message,
          ok: attempt.ok,
          payload_name: attempt.payload_name,
          status: attempt.status,
        })),
        list_script_count: scripts.length,
        message,
        status: installResult.status,
      },
      [401, 403].includes(installResult.status) ? 403 : 502,
    );
  }

  // Read back the script list to confirm Nuvemshop actually persisted the
  // installation, instead of trusting the write response alone.
  const verification = await verifyLuupScript(
    scriptApiBase,
    scriptApiHeaders,
    scriptIdForApi,
  );

  await saveScriptInstall({
    auto_installed: Boolean(existing?.is_auto_install) || autoInstallMode,
    installation_id: installationId,
    source: "nuvemshop_public_api",
    status:
      (installData as ScriptRecord).status ||
      verification.script?.status ||
      existing?.status ||
      null,
    verified: verification.verified,
    verified_at: new Date().toISOString(),
  });

  return jsonResponse({
    installed: true,
    installation_id: installationId,
    method: `${method}:${installResult.payload_name}`,
    ok: true,
    script: installData,
    script_id: scriptIdForApi || String(installationId || ""),
    verified: verification.verified,
    verified_script: publicScriptSnapshot(verification.script),
  });
});
