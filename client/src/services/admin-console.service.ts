import { apiGet, apiPost } from "@/lib/api";
import type {
  AdminConsoleAction,
  AdminConsoleSnapshot,
  AdminCursorPage,
  AdminStoreComment,
  AdminStoreDetail,
  AdminStoreEventsPage,
  AdminStorePatch,
  AdminStoreProduct,
  AdminStoreVideo,
} from "@/types/admin-console";

type CursorListOptions = { cursor?: string | null; search?: string };

async function fetchStoreList<TItem>(
  storeId: string,
  resource: "products" | "videos" | "comments",
  options: CursorListOptions,
) {
  const params = new URLSearchParams();
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.search?.trim()) params.set("search", options.search.trim());
  const data = await apiGet<AdminCursorPage<TItem>>(
    `/api/admin-console/stores/${encodeURIComponent(storeId)}/${resource}?${params}`,
  );
  if (!data) throw new Error("Admin Console não retornou dados.");
  return data;
}

type AdminConsoleActionPayload = {
  current_trial_ends_at?: string | null;
  days?: number;
  email?: string;
  member_id?: string;
  patch?: AdminStorePatch | Record<string, unknown>;
  plan_id?: string;
  role?: string;
  store_id: string;
  user_id?: string;
  widget_id?: string;
};

async function invokeAdminConsole<T>(
  body: Record<string, unknown>,
): Promise<T> {
  const data = await apiPost<T>("/api/admin-console", body);

  if (!data) throw new Error("Admin Console não retornou dados.");
  return data;
}

export const adminConsoleService = {
  async getSnapshot() {
    return invokeAdminConsole<AdminConsoleSnapshot>({ action: "snapshot" });
  },

  async getStoreDetail(storeId: string) {
    const data = await apiGet<AdminStoreDetail>(
      `/api/admin-console/stores/${encodeURIComponent(storeId)}`,
    );
    if (!data) throw new Error("Admin Console não retornou dados.");
    return data;
  },

  async getStoreEvents(
    storeId: string,
    options: {
      cursor?: string | null;
      days?: number;
      search?: string;
      types?: string[];
    } = {},
  ) {
    const params = new URLSearchParams({ days: String(options.days ?? 30) });
    if (options.cursor) params.set("cursor", options.cursor);
    if (options.types?.length) params.set("types", options.types.join(","));
    if (options.search?.trim()) params.set("search", options.search.trim());
    const data = await apiGet<AdminStoreEventsPage>(
      `/api/admin-console/stores/${encodeURIComponent(storeId)}/events?${params}`,
    );
    if (!data) throw new Error("Admin Console não retornou dados.");
    return data;
  },

  async getStoreProducts(storeId: string, options: CursorListOptions = {}) {
    return fetchStoreList<AdminStoreProduct>(storeId, "products", options);
  },

  async getStoreVideos(storeId: string, options: CursorListOptions = {}) {
    return fetchStoreList<AdminStoreVideo>(storeId, "videos", options);
  },

  async getStoreComments(storeId: string, options: CursorListOptions = {}) {
    return fetchStoreList<AdminStoreComment>(storeId, "comments", options);
  },

  async runAction(action: AdminConsoleAction, payload: AdminConsoleActionPayload) {
    return invokeAdminConsole<{ ok: boolean; result: Record<string, unknown> }>({
      action,
      ...payload,
    });
  },
};
