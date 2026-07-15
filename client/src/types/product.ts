import type { TableInsert, TableRow, TableUpdate } from "./database";

export type LuppProduct = TableRow<"products">;
export type CreateProductPayload = TableInsert<"products">;
export type UpdateProductPayload = TableUpdate<"products">;
