import { apiGet, apiPatch, apiPost, apiUpload } from "@/lib/api";
import type { TableRow, TableUpdate } from "@/types/database";
import type { CreateStorePayload } from "@/types/store";

type StoreRow = TableRow<"stores">;

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

function isSlugConflictError(error: unknown) {
  return error instanceof Error && /slug.conflict|slug_conflict/i.test(error.message);
}

export const storesService = {
  async listUserStores() {
    const data = await apiGet<{ stores: StoreRow[] }>("/api/stores");
    return data.stores ?? [];
  },

  async getStore(storeId: string) {
    const data = await apiGet<{ store: StoreRow }>(`/api/stores/${storeId}`);
    return data.store;
  },

  // The onboarding cascade (owner membership, trialing subscription, default
  // widgets, feed page + settings, slug dedup retry) runs server-side in one
  // transaction; the owner comes from the session token.
  async createStoreWithDefaults(payload: CreateStorePayload) {
    const slug = payload.slug?.trim() || slugifyStoreName(payload.name);
    const data = await apiPost<{ store: StoreRow }>("/api/stores", {
      name: payload.name,
      slug,
      url: payload.url || null,
      platform: payload.platform,
      segment: payload.segment,
    });
    return data.store;
  },

  async updateStore(storeId: string, updates: TableUpdate<"stores">) {
    const data = await apiPatch<{ store: StoreRow }>(
      `/api/stores/${storeId}`,
      updates as Record<string, unknown>,
    );
    return data.store;
  },

  async updateStoreIdentity(storeId: string, updates: TableUpdate<"stores">) {
    const nextSlug = inferStoreSlug(String(updates.name || ""), String(updates.url || ""));
    try {
      return await this.updateStore(storeId, { ...updates, slug: nextSlug });
    } catch (error) {
      // The server already retries once with a suffixed slug; a surviving
      // conflict means both were taken.
      if (!isSlugConflictError(error)) throw error;
      throw new Error("Esse nome de loja já está em uso. Escolha outro nome.");
    }
  },

  async uploadStoreLogo(storeId: string, file: File) {
    const data = await apiUpload<{ url: string }>(`/api/stores/${storeId}/logo`, file);
    return data.url;
  },
};
