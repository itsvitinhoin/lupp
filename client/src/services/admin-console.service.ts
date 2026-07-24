import { apiDelete, apiGet, apiPost } from "@/lib/api";
import type {
  AdminBunnySummary,
  AdminBunnyVideosPage,
  AdminConsoleAction,
  AdminConsoleSnapshot,
  AdminCursorPage,
  AdminPlatformUser,
  AsaasAccountOverview,
  AsaasAccountSubscription,
  AsaasCustomer,
  AsaasDailySeries,
  AsaasInvoice,
  AsaasInvoiceFilters,
  AsaasListPage,
  AsaasPayment,
  AsaasPaymentFilters,
  AsaasSummary,
  AdminStoreComment,
  AdminStoreDetail,
  AdminStoreEventsPage,
  AdminStorePatch,
  AdminStoreProduct,
  AdminStoreVideo,
} from "@/types/admin-console";

type CursorListOptions = { cursor?: string | null; search?: string };

async function fetchAsaasList<TItem>(
  resource: "payments" | "customers" | "subscriptions" | "invoices",
  options: Record<string, string | number | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const data = await apiGet<AsaasListPage<TItem>>(
    `/api/billing/asaas/${resource}?${params}`,
  );
  if (!data) throw new Error("Asaas não retornou dados.");
  return data;
}

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
  confirmed?: boolean;
  current_trial_ends_at?: string | null;
  days?: number;
  email?: string;
  member_id?: string;
  patch?: AdminStorePatch | Record<string, unknown>;
  plan_id?: string;
  role?: string;
  store_id?: string;
  target_store_id?: string;
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

  async getUsers(
    options: CursorListOptions & {
      emailConfirmed?: "true" | "false";
      role?: string;
      storeId?: string;
    } = {},
  ) {
    const params = new URLSearchParams();
    if (options.cursor) params.set("cursor", options.cursor);
    if (options.search?.trim()) params.set("search", options.search.trim());
    if (options.role) params.set("role", options.role);
    if (options.emailConfirmed) params.set("email_confirmed", options.emailConfirmed);
    if (options.storeId) params.set("store_id", options.storeId);
    const data = await apiGet<AdminCursorPage<AdminPlatformUser>>(
      `/api/admin-console/users?${params}`,
    );
    if (!data) throw new Error("Admin Console não retornou dados.");
    return data;
  },

  async getAsaasAccount() {
    const data = await apiGet<AsaasAccountOverview>("/api/billing/asaas/account");
    if (!data) throw new Error("Asaas não retornou dados.");
    return data;
  },

  async getAsaasPayments(options: AsaasPaymentFilters = {}) {
    return fetchAsaasList<AsaasPayment>("payments", { ...options });
  },

  async getAsaasCustomers(options: { name?: string; offset?: number } = {}) {
    return fetchAsaasList<AsaasCustomer>("customers", options);
  },

  async getAsaasSubscriptions(
    options: { billingType?: string; offset?: number; status?: string } = {},
  ) {
    return fetchAsaasList<AsaasAccountSubscription>("subscriptions", { ...options });
  },

  async getAsaasInvoices(options: AsaasInvoiceFilters = {}) {
    return fetchAsaasList<AsaasInvoice>("invoices", { ...options });
  },

  async getAsaasSummary(days = 30) {
    const data = await apiGet<AsaasSummary>(
      `/api/billing/asaas/summary?days=${days}`,
    );
    if (!data) throw new Error("Asaas não retornou dados.");
    return data;
  },

  async getAsaasDailyPayments(days = 30) {
    const data = await apiGet<AsaasDailySeries>(
      `/api/billing/asaas/payments/daily?days=${days}`,
    );
    if (!data) throw new Error("Asaas não retornou dados.");
    return data;
  },

  async runAction(action: AdminConsoleAction, payload: AdminConsoleActionPayload) {
    return invokeAdminConsole<{ ok: boolean; result: Record<string, unknown> }>({
      action,
      ...payload,
    });
  },

  async getBunnyVideos(
    options: { page?: number; itemsPerPage?: number; search?: string } = {},
  ) {
    const params = new URLSearchParams();
    if (options.page) params.set("page", String(options.page));
    if (options.itemsPerPage) params.set("itemsPerPage", String(options.itemsPerPage));
    if (options.search?.trim()) params.set("search", options.search.trim());
    const data = await apiGet<AdminBunnyVideosPage>(
      `/api/admin-console/bunny/videos?${params}`,
    );
    if (!data) throw new Error("Bunny não retornou dados.");
    return data;
  },

  async getBunnySummary() {
    const data = await apiGet<AdminBunnySummary>("/api/admin-console/bunny/summary");
    if (!data) throw new Error("Bunny não retornou dados.");
    return data;
  },

  async deleteBunnyVideo(guid: string) {
    const data = await apiDelete<{ ok: boolean }>(
      `/api/admin-console/bunny/videos/${encodeURIComponent(guid)}`,
    );
    if (!data) throw new Error("Bunny não retornou dados.");
    return data;
  },
};
