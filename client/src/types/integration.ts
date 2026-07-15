import type { LuppProduct } from "./product";
import type { TableRow } from "./database";

export type LuppIntegration = TableRow<"integrations">;

export interface EcommerceIntegration {
  provider: string;
  connect(storeId: string): Promise<void>;
  syncProducts(storeId: string): Promise<LuppProduct[]>;
  createCartUrl?(product: LuppProduct): string;
}
