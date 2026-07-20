import { BaseClient, nuvemshopApiBase } from "./base";
import type { StoreScopedClientProps } from "./products";

export type NuvemshopStoreInfo = {
  domains?: string[] | null;
  original_domain?: string | null;
};

/** Store resource (api.nuvemshop.com.br): storefront domains and metadata. */
export class StoreClient extends BaseClient {
  public externalStoreId: string;

  constructor({ accessToken, externalStoreId, userAgent }: StoreScopedClientProps) {
    super({ accessToken, userAgent });
    this.externalStoreId = externalStoreId;
  }

  get endpoint() {
    return `${nuvemshopApiBase(this.externalStoreId)}/store`;
  }

  async get() {
    const result = await this.doRequest("GET", this.endpoint);
    return { ...result, data: result.data as NuvemshopStoreInfo };
  }
}
