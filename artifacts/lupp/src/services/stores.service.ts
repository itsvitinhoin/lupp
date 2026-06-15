import { DEFAULT_WIDGETS } from "@/lib/constants";
import { requireSupabase } from "@/lib/supabase";
import type { TableUpdate } from "@/types/database";
import type { CreateStorePayload } from "@/types/store";

export function slugifyStoreName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export const storesService = {
  async listUserStores() {
    const { data, error } = await requireSupabase()
      .from("stores")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async getStore(storeId: string) {
    const { data, error } = await requireSupabase().from("stores").select("*").eq("id", storeId).single();
    if (error) throw error;
    return data;
  },

  async getPublicStoreBySlug(slug: string) {
    const { data, error } = await requireSupabase()
      .from("stores")
      .select("*")
      .eq("slug", slug)
      .eq("status", "active")
      .single();
    if (error) throw error;
    return data;
  },

  async createStoreWithDefaults(payload: CreateStorePayload) {
    const slug = payload.slug?.trim() || slugifyStoreName(payload.name);
    const supabase = requireSupabase();

    const { data: store, error } = await supabase
      .from("stores")
      .insert({
        owner_id: payload.ownerId,
        name: payload.name,
        slug,
        url: payload.url || null,
        platform: payload.platform,
        segment: payload.segment,
        plan_id: "start",
      })
      .select("*")
      .single();

    if (error) throw error;

    await supabase
      .from("store_members")
      .insert({ store_id: store.id, user_id: payload.ownerId, role: "owner" })
      .throwOnError();

    await supabase
      .from("subscriptions")
      .insert({
        store_id: store.id,
        plan_id: "start",
        status: "trialing",
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .throwOnError();

    await supabase
      .from("widgets")
      .insert(
        DEFAULT_WIDGETS.map((widget, index) => ({
          store_id: store.id,
          name: widget.name,
          type: widget.type,
          target: widget.target,
          status: index === 0 ? "active" : "inactive",
        })),
      )
      .throwOnError();

    await supabase
      .from("custom_pages")
      .insert({ store_id: store.id, name: "Feed Principal", slug: "videos", status: "draft" })
      .throwOnError();

    await supabase.from("feed_settings").insert({ store_id: store.id, slug: "videos" }).throwOnError();

    return store;
  },

  async updateStore(storeId: string, updates: TableUpdate<"stores">) {
    const { data, error } = await requireSupabase().from("stores").update(updates).eq("id", storeId).select("*").single();
    if (error) throw error;
    return data;
  },
};
