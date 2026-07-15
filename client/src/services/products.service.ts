import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { integrationsService } from "./integrations.service";
import type { TableRow } from "@/types/database";
import type {
  CreateProductPayload,
  UpdateProductPayload,
} from "@/types/product";

type ProductRow = TableRow<"products">;

export const productsService = {
  async listProducts(storeId: string, search = "", status = "all") {
    const params = new URLSearchParams({ store_id: storeId });
    if (search) params.set("search", search);
    if (status !== "all") params.set("status", status);

    const data = await apiGet<{ products: ProductRow[] }>(`/api/products?${params}`);
    return data.products ?? [];
  },

  async createProduct(payload: CreateProductPayload) {
    const data = await apiPost<{ product: ProductRow }>("/api/products", payload);
    return data.product;
  },

  async updateProduct(productId: string, payload: UpdateProductPayload) {
    const data = await apiPatch<{ product: ProductRow }>(
      `/api/products/${productId}`,
      payload,
    );
    return data.product;
  },

  async deleteProduct(productId: string) {
    await apiDelete(`/api/products/${productId}`);
  },

  async syncNuvemshopProducts(storeId: string) {
    return integrationsService.syncNuvemshopProducts(storeId);
  },

  async syncProductsForStore(store: { id: string; platform?: string | null }) {
    return store.platform === "upzero"
      ? integrationsService.syncUpzeroProducts(store.id)
      : store.platform === "shopify"
        ? integrationsService.syncShopifyProducts(store.id)
        : integrationsService.syncNuvemshopProducts(store.id);
  },
};
