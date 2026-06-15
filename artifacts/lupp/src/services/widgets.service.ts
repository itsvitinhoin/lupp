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

  async installNuvemshopScript(storeId: string) {
    const client = requireSupabase();
    const {
      data: { session },
      error: sessionError,
    } = await client.auth.getSession();

    if (sessionError) throw sessionError;
    if (!session) throw new Error("Sua sessão expirou. Entre novamente para instalar o script.");

    const { data, error } = await client.functions.invoke<{ installed: boolean; method: string; script_id: string }>("nuvemshop-install-script", {
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

    return data ?? { installed: true, method: "POST", script_id: "" };
  },

  getEmbedCode(storeSlug: string, widgetType: string) {
    return `<script src="${env.widgetCdnUrl}" data-store="${storeSlug}" data-widget="${widgetType}"></script>`;
  },
};
