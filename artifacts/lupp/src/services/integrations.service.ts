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
