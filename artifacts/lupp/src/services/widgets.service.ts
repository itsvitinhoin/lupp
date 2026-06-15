import { env } from "@/lib/env";
import { requireSupabase } from "@/lib/supabase";
import type { TableUpdate } from "@/types/database";

export const widgetsService = {
  async listWidgets(storeId: string) {
    const { data, error } = await requireSupabase().from("widgets").select("*").eq("store_id", storeId).order("created_at");
    if (error) throw error;
    return data ?? [];
  },

  async updateWidget(widgetId: string, updates: TableUpdate<"widgets">) {
    const { data, error } = await requireSupabase().from("widgets").update(updates).eq("id", widgetId).select("*").single();
    if (error) throw error;
    return data;
  },

  getEmbedCode(storeSlug: string, widgetType: string) {
    return `<script src="${env.widgetCdnUrl}" data-store="${storeSlug}" data-widget="${widgetType}"></script>`;
  },
};
