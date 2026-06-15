import { requireSupabase } from "@/lib/supabase";
import type { CreateProductPayload, UpdateProductPayload } from "@/types/product";

export const productsService = {
  async listProducts(storeId: string, search = "", status = "all") {
    let query = requireSupabase().from("products").select("*").eq("store_id", storeId).order("created_at", { ascending: false });

    if (search) query = query.ilike("name", `%${search}%`);
    if (status !== "all") query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async createProduct(payload: CreateProductPayload) {
    const { data, error } = await requireSupabase().from("products").insert(payload).select("*").single();
    if (error) throw error;
    return data;
  },

  async updateProduct(productId: string, payload: UpdateProductPayload) {
    const { data, error } = await requireSupabase().from("products").update(payload).eq("id", productId).select("*").single();
    if (error) throw error;
    return data;
  },

  async deleteProduct(productId: string) {
    const { error } = await requireSupabase().from("products").delete().eq("id", productId);
    if (error) throw error;
  },
};
