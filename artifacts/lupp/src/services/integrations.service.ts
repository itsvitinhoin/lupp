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

export const integrationsService = {
  async listIntegrations(storeId: string) {
    const { data, error } = await requireSupabase().from("integrations").select("*").eq("store_id", storeId).order("provider");
    if (error) throw error;
    return data ?? [];
  },

  async createNuvemshopAuthorizeUrl(storeId: string) {
    const client = requireSupabase();
    const {
      data: { session },
      error: sessionError,
    } = await client.auth.getSession();

    if (sessionError) throw sessionError;
    if (!session) {
      throw new Error("Sua sessão expirou. Entre novamente para conectar a Nuvemshop.");
    }

    const { data, error } = await client.functions.invoke<{ authorize_url: string }>("nuvemshop-oauth-start", {
      body: {
        return_to: `${window.location.origin}/app/integrations`,
        store_id: storeId,
      },
    });
    if (error) {
      if ("context" in error && error.context instanceof Response) {
        const details = await error.context.json().catch(() => null);
        if (details && typeof details.error === "string") {
          throw new Error(details.error.replace(/_/g, " "));
        }
      }
      throw error;
    }
    if (!data?.authorize_url) throw new Error("Não foi possível iniciar a conexão com a Nuvemshop.");
    return data.authorize_url;
  },

  async syncNuvemshopProducts(storeId: string) {
    const client = requireSupabase();
    const {
      data: { session },
      error: sessionError,
    } = await client.auth.getSession();

    if (sessionError) throw sessionError;
    if (!session) {
      throw new Error("Sua sessão expirou. Entre novamente para sincronizar produtos.");
    }

    const { data, error } = await client.functions.invoke<{ count: number; ok: boolean; pages: number }>("nuvemshop-sync-products", {
      body: { store_id: storeId },
    });

    if (error) {
      if ("context" in error && error.context instanceof Response) {
        const details = await error.context.json().catch(() => null);
        if (details && typeof details.error === "string") {
          throw new Error(details.error.replace(/_/g, " "));
        }
      }
      throw error;
    }

    return data ?? { count: 0, ok: true, pages: 0 };
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
