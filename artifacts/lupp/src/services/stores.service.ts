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

export function inferStoreSlug(name: string, url?: string | null) {
  const nameSlug = slugifyStoreName(name);
  if (nameSlug) return nameSlug;

  try {
    const normalizedUrl = url?.match(/^https?:\/\//i) ? url : `https://${url}`;
    const hostname = new URL(normalizedUrl || "").hostname.replace(/^www\./i, "");
    return slugifyStoreName(hostname.split(".")[0] || "loja");
  } catch {
    return "loja";
  }
}

function isDuplicateSlugError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: string; message?: string };
  return maybeError.code === "23505" && /slug/i.test(maybeError.message || "");
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

    const trialStartedAt = new Date();
    const trialEndsAt = new Date(
      trialStartedAt.getTime() + 7 * 24 * 60 * 60 * 1000,
    );

    let insertPayload = {
      owner_id: payload.ownerId,
      name: payload.name,
      slug,
      url: payload.url || null,
      platform: payload.platform,
      segment: payload.segment,
      plan_id: "start",
      trial_started_at: trialStartedAt.toISOString(),
      trial_ends_at: trialEndsAt.toISOString(),
    };

    let { data: store, error } = await supabase
      .from("stores")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error && isDuplicateSlugError(error)) {
      insertPayload = { ...insertPayload, slug: `${slug}-${payload.ownerId.slice(0, 6)}` };
      const retry = await supabase.from("stores").insert(insertPayload).select("*").single();
      store = retry.data;
      error = retry.error;
    }

    if (error) throw error;
    if (!store) throw new Error("Não foi possível criar a loja.");

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
        current_period_start: trialStartedAt.toISOString(),
        current_period_end: trialEndsAt.toISOString(),
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
          status: widget.type === "floating_video" ? "active" : "inactive",
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

  async updateStoreIdentity(storeId: string, updates: TableUpdate<"stores">) {
    const nextSlug = inferStoreSlug(String(updates.name || ""), String(updates.url || ""));
    const payload = { ...updates, slug: nextSlug };

    const supabase = requireSupabase();
    const { data, error } = await supabase.from("stores").update(payload).eq("id", storeId).select("*").single();
    if (!error) return data;

    if (!isDuplicateSlugError(error) || !nextSlug) throw error;

    const fallbackPayload = { ...updates, slug: `${nextSlug}-${storeId.slice(0, 6)}` };
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("stores")
      .update(fallbackPayload)
      .eq("id", storeId)
      .select("*")
      .single();
    if (fallbackError) throw fallbackError;
    return fallbackData;
  },

  async uploadStoreLogo(storeId: string, file: File) {
    const supabase = requireSupabase();
    const extension = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${storeId}/logos/${crypto.randomUUID()}.${extension}`;

    const { error } = await supabase.storage.from("store-assets").upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

    if (error) throw error;

    const { data } = supabase.storage.from("store-assets").getPublicUrl(path);
    return data.publicUrl;
  },
};
