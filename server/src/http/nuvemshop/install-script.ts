import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { findStoreMembership } from "@/lib/store-membership";
import { nuvemshopRequest, nuvemshopScriptsApiBase } from "@/lib/nuvemshop";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { asRecord } from "@/lib/text";

// Ported from supabase/functions/nuvemshop-install-script. Talks to the
// Tiendanube Scripts API (list/POST/PUT + read-back verification) and keeps
// the install bookkeeping under integrations.settings.script_install.
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

const BodySchema = z.object({
  store_id: z.string().optional().describe("Store whose Nuvemshop script installs."),
});

// Responses carry provider payloads/diagnostics beyond { error }, so the
// error shapes with extra fields stay loose (the strict edge schema would
// strip them on serialization).
const looseBody = z.looseObject({}).describe("Provider payload / diagnostics.");

export const NuvemshopInstallScriptSchema = {
  schema: {
    summary: "Install Nuvemshop storefront script",
    description:
      "Ensures the Luup script is installed on the connected Nuvemshop store via the " +
      "Tiendanube Scripts API: lists existing scripts, POSTs or PUTs the installation " +
      "with the widget query params, re-reads the list to verify persistence and " +
      "records the result under integrations.settings.script_install. In auto-install " +
      "mode (no NUVEMSHOP_SCRIPT_ID) it reports the exact state Nuvemshop exposes " +
      "instead of a blind success.",
    tags: ["nuvemshop"],
    operationId: "nuvemshopInstallScript",
    security: [{ bearerAuth: [] }],
    body: BodySchema,
    response: {
      200: looseBody,
      ...edgeErrorSchemas,
      403: z.looseObject({ error: z.string() }),
      409: looseBody,
      502: z.looseObject({ error: z.string() }),
    },
  },
};

function normalizeScriptId(scriptId: string) {
  const parsed = Number(scriptId);
  return Number.isFinite(parsed) ? parsed : scriptId;
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
  const result = await nuvemshopRequest(`${scriptApiBase}?page=1&per_page=100`, {
    headers,
  });
  if (!result.ok) {
    return { script: null, status: result.status, verified: false };
  }
  const scripts = scriptList(result.data as ScriptApiResponse);
  const script = scripts.find((item) => isLuupScript(item, scriptId)) || null;
  return { script, status: result.status, verified: Boolean(script) };
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
    const result = await nuvemshopRequest(endpoint, {
      body: requestPayload,
      headers,
      method,
    });
    const body = result.data as ScriptApiResponse;
    const message = externalMessage(body);
    attempts.push({
      body,
      message,
      ok: result.ok,
      payload_name: payloadName,
      status: result.status,
    });
    if (result.ok) {
      return {
        attempts,
        body,
        message,
        ok: true,
        payload_name: payloadName,
        status: result.status,
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

export async function nuvemshopInstallScriptHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  // Not yet promoted to src/env.ts: the script id/auto-install flag and the
  // provider User-Agent keep the originals' env names and defaults.
  const scriptId = process.env.NUVEMSHOP_SCRIPT_ID || "";
  const scriptAutoInstall = (process.env.NUVEMSHOP_SCRIPT_AUTO_INSTALL || "true") !== "false";
  const appUrl = env.LUPP_APP_URL;
  const appUserAgent = process.env.NUVEMSHOP_USER_AGENT || "Luup (suporte@luup.app)";

  const body = BodySchema.parse(request.body ?? {});
  const storeId = (body.store_id ?? "").trim();
  if (!storeId) return reply.status(400).send({ error: "missing_store_id" });

  if (!scriptId && !scriptAutoInstall) {
    return reply.status(500).send({ error: "missing_nuvemshop_script_id" });
  }

  const member = await findStoreMembership(request.user.sub, storeId);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, slug: true, url: true },
  });
  if (!store?.slug) return reply.status(404).send({ error: "store_not_found" });

  const integration = await prisma.integration.findFirst({
    where: { store_id: storeId, provider: "nuvemshop", status: "active" },
    select: { id: true, external_store_id: true, settings: true },
  });
  if (!integration?.id || !integration.external_store_id) {
    return reply.status(400).send({ error: "nuvemshop_not_connected" });
  }

  const secret = await prisma.integrationSecret.findUnique({
    where: { integration_id: integration.id },
    select: { access_token: true },
  });
  if (!secret?.access_token) {
    return reply.status(400).send({ error: "missing_nuvemshop_access_token" });
  }

  const integrationId = integration.id;
  const externalStoreId = String(integration.external_store_id);
  const queryParams = {
    external_store_id: externalStoreId,
    lupp_external_store_id: externalStoreId,
    lupp_store_domain: store.url || "",
    lupp_store: store.slug,
    // The original passed SUPABASE_URL here for the widget loader; kept for
    // compatibility while storefront scripts still read it.
    lupp_supabase_url: process.env.SUPABASE_URL || "",
    lupp_url: appUrl,
    lupp_widget: "floating_launcher",
    lupp_require_active: "true",
  };

  const integrationSettings = asRecord(integration.settings);

  // Auto-install mode no longer returns a blind success: the flow below
  // always consults GET /scripts so the admin sees whether Nuvemshop is
  // actually serving the Luup script, and refreshes its query params.
  const autoInstallMode = scriptAutoInstall && !scriptId;

  async function saveScriptInstall(record: Record<string, unknown>) {
    await prisma.integration.update({
      where: { id: integrationId },
      data: {
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
      },
    });
  }

  const scriptApiBase = nuvemshopScriptsApiBase(externalStoreId);
  const scriptApiHeaders = {
    Authorization: `Bearer ${secret.access_token}`,
    "Content-Type": "application/json",
    "User-Agent": appUserAgent,
  };
  const scriptIdForApi = scriptId;
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

  const listResult = await nuvemshopRequest(`${scriptApiBase}?page=1&per_page=100`, {
    headers: scriptApiHeaders,
  });

  if (!listResult.ok) {
    const permissionMissing = [401, 403].includes(listResult.status);
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
        warning_status: listResult.status,
      });
      return reply.status(200).send({
        auto_installed: true,
        installed: true,
        method: "AUTO_INSTALL_UNVERIFIED",
        ok: true,
        script_id: "nuvemshop-auto-install",
        verified: false,
        warning: permissionMissing
          ? "nuvemshop_scripts_permission_missing"
          : "nuvemshop_script_list_failed",
        warning_status: listResult.status,
        message:
          "Nao foi possivel confirmar na API da Nuvemshop se o script do app esta ativo. Verifique a vitrine ou as permissoes do app (write_scripts).",
      });
    }
    if (permissionMissing) {
      return reply
        .status(403)
        .send({ error: "nuvemshop_scripts_permission_missing", status: listResult.status });
    }
    return reply.status(502).send({
      details: listResult.text.slice(0, 500),
      error: "nuvemshop_script_list_failed",
      status: listResult.status,
    });
  }

  const scripts = scriptList(listResult.data as ScriptApiResponse);
  const existing = scripts.find((script) => isLuupScript(script, scriptIdForApi));

  if (autoInstallMode && !existing) {
    // The app should auto-inject its script, but Nuvemshop reports none
    // installed for this store — surface the exact state to the admin.
    await saveScriptInstall({
      source: "nuvemshop_app_auto_install",
      status: "auto_install_not_confirmed",
      verified: false,
    });
    return reply.status(409).send({
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
    });
  }

  const method = existing ? "PUT" : "POST";
  const installationId = existing?.id ? String(existing.id) : scriptIdForApi;
  const endpoint = existing ? `${scriptApiBase}/${installationId}` : scriptApiBase;
  let installResult = await tryInstallScript(endpoint, scriptApiHeaders, method, payloads);

  if (!installResult.ok && installResult.status === 409 && scriptIdForApi) {
    const conflictResult = await tryInstallScript(
      `${scriptApiBase}/${scriptIdForApi}`,
      scriptApiHeaders,
      "PUT",
      payloads,
    );
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

      return reply.status(200).send({
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

    return reply
      .status([401, 403].includes(installResult.status) ? 403 : 502)
      .send({
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
      });
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

  return reply.status(200).send({
    installed: true,
    installation_id: installationId,
    method: `${method}:${installResult.payload_name}`,
    ok: true,
    script: installData,
    script_id: scriptIdForApi || String(installationId || ""),
    verified: verification.verified,
    verified_script: publicScriptSnapshot(verification.script),
  });
}
