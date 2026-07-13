import { apiPost } from "@/lib/api";
import { TRACKING_PROVIDERS } from "@/lib/constants";
import { requireSupabase } from "@/lib/supabase";
import type { EcommerceIntegration } from "@/types/integration";
import type { LuppProduct } from "@/types/product";

export abstract class PlaceholderEcommerceIntegration implements EcommerceIntegration {
  constructor(public provider: string) {}

  async connect(): Promise<void> {
    throw new Error(`${this.provider} ainda está em desenvolvimento. Cadastre produtos manualmente por enquanto.`);
  }

  async syncProducts(): Promise<LuppProduct[]> {
    throw new Error(`${this.provider} ainda está em desenvolvimento. Cadastre produtos manualmente por enquanto.`);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function extractErrorMessage(details: unknown): string {
  if (typeof details === "string") return details;
  const payload = asRecord(details);
  if (!payload) return "";

  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.error === "string") return payload.error;

  const nestedError = asRecord(payload.error);
  if (typeof nestedError?.message === "string") return nestedError.message;

  return "";
}

function humanizeFunctionError(details: unknown) {
  const payload = asRecord(details);
  if (!payload) return null;

  const error = typeof payload.error === "string" ? payload.error : "";
  const status = typeof payload.status === "number" ? payload.status : null;
  const nestedDetails = asRecord(payload.details);
  const nestedMessage = extractErrorMessage(nestedDetails) || extractErrorMessage(payload);

  if (Array.isArray(payload.attempts)) {
    const attempts = payload.attempts
      .map((attempt) => {
        const item = asRecord(attempt);
        if (!item) return null;
        const source = typeof item.source === "string" ? item.source : "api";
        const itemStatus = typeof item.status === "number" ? item.status : "?";
        const itemMessage = extractErrorMessage(item.details);
        return `${source} ${itemStatus}${itemMessage ? `: ${itemMessage}` : ""}`;
      })
      .filter(Boolean)
      .join(" | ");

    if (error === "upzero_connection_test_failed") {
      return `Falha no teste da UP Zero (${attempts}). Confira a API key, permissões de produtos e URL da API.`;
    }
    if (error === "upzero_storefront_product_sync_failed") {
      return `A UP Zero não liberou a lista de produtos pelo storefront (${attempts}). Confira se a API key tem permissão para produtos, imagens e variantes.`;
    }
    if (error === "upzero_external_product_sync_failed") {
      return `A UP Zero não liberou a lista de produtos pelo endpoint externo (${attempts}). Confira se a integração/API key tem permissão para produtos, imagens e variantes.`;
    }
  }

  if (error === "upzero_connection_test_failed") {
    return `Falha no teste da UP Zero${status ? ` (${status})` : ""}${nestedMessage ? `: ${nestedMessage}` : ""}.`;
  }

  return error ? `${error.replace(/_/g, " ")}${nestedMessage && nestedMessage !== error ? `: ${nestedMessage}` : ""}` : null;
}

async function requireSession(expiredMessage: string) {
  const client = requireSupabase();
  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession();

  if (sessionError) throw sessionError;
  if (!session) throw new Error(expiredMessage);
  return session;
}

export const integrationsService = {
  async listIntegrations(storeId: string) {
    const { data, error } = await requireSupabase().from("integrations").select("*").eq("store_id", storeId).order("provider");
    if (error) throw error;
    return data ?? [];
  },

  async createNuvemshopAuthorizeUrl(storeId: string) {
    await requireSession("Sua sessão expirou. Entre novamente para conectar a Nuvemshop.");

    const data = await apiPost<{ authorize_url: string }>(
      "/api/integrations/nuvemshop/oauth/start",
      {
        return_to: `${window.location.origin}/app/integrations`,
        store_id: storeId,
      },
      { humanize: humanizeFunctionError },
    );

    if (!data?.authorize_url) throw new Error("Não foi possível iniciar a conexão com a Nuvemshop.");
    return data.authorize_url;
  },

  async createShopifyAuthorizeUrl(storeId: string, shop?: string) {
    await requireSession("Sua sessão expirou. Entre novamente para conectar a Shopify.");

    const data = await apiPost<{ authorize_url: string; shop?: string }>(
      "/api/integrations/shopify/oauth/start",
      {
        return_to: `${window.location.origin}/app/integrations`,
        shop,
        store_id: storeId,
      },
      { humanize: humanizeFunctionError },
    );

    if (!data?.authorize_url) throw new Error("Não foi possível iniciar a conexão com a Shopify.");
    return data.authorize_url;
  },

  async syncNuvemshopProducts(storeId: string) {
    await requireSession("Sua sessão expirou. Entre novamente para sincronizar produtos.");

    const data = await apiPost<{ count: number; ok: boolean; pages: number }>(
      "/api/integrations/nuvemshop/sync-products",
      { store_id: storeId },
      { humanize: humanizeFunctionError },
    );

    return data ?? { count: 0, ok: true, pages: 0 };
  },

  async syncShopifyProducts(storeId: string) {
    await requireSession("Sua sessão expirou. Entre novamente para sincronizar produtos.");

    const data = await apiPost<{ count: number; ok: boolean; pages: number; variants_count?: number }>(
      "/api/integrations/shopify/sync-products",
      { store_id: storeId },
      { humanize: humanizeFunctionError },
    );

    return data ?? { count: 0, ok: true, pages: 0 };
  },

  async connectShopifyCustomApp(
    storeId: string,
    payload: {
      accessToken?: string;
      clientId?: string;
      clientSecret?: string;
      shop: string;
    },
  ) {
    await requireSession("Sua sessão expirou. Entre novamente para conectar a Shopify.");

    const data = await apiPost<{
      integration_id: string;
      ok: boolean;
      shop_domain: string;
      shop_name?: string;
    }>(
      "/api/integrations/shopify/connect-custom-app",
      {
        access_token: payload.accessToken || "",
        client_id: payload.clientId || "",
        client_secret: payload.clientSecret || "",
        shop: payload.shop,
        store_id: storeId,
      },
      { humanize: humanizeFunctionError },
    );

    if (!data?.ok) throw new Error("Não foi possível salvar a conexão manual da Shopify.");
    return data;
  },

  async connectUpzero(storeId: string, payload: { apiKey: string; baseUrl?: string; integrationName?: string; storefrontUrl?: string; productUrlPattern?: string }) {
    await requireSession("Sua sessão expirou. Entre novamente para conectar a UP Zero.");

    const data = await apiPost<{ ok: boolean; products_previewed: number }>(
      "/api/integrations/upzero/connect",
      { store_id: storeId, ...payload },
      { humanize: humanizeFunctionError },
    );

    return data ?? { ok: true, products_previewed: 0 };
  },

  async syncUpzeroProducts(storeId: string) {
    await requireSession("Sua sessão expirou. Entre novamente para sincronizar produtos.");

    const data = await apiPost<{
      count: number;
      detail_enriched?: number;
      images_found?: number;
      ok: boolean;
      pages: number;
      source: string;
      variants?: number;
      variants_with_attributes?: number;
      variants_with_images?: number;
    }>(
      "/api/integrations/upzero/sync-products",
      { store_id: storeId },
      { humanize: humanizeFunctionError },
    );

    return data ?? { count: 0, ok: true, pages: 0, source: "storefront" };
  },

  async upsertTrackingSettings(storeId: string, provider: (typeof TRACKING_PROVIDERS)[number], settings: Record<string, string>) {
    const { data, error } = await requireSupabase()
      .from("integrations")
      .upsert(
        {
          store_id: storeId,
          provider,
          status: settings.enabled ? "active" : "available",
          settings,
        },
        { onConflict: "store_id,provider" },
      )
      .select("*")
      .single();
    if (error) throw error;
    return data;
  },
};
