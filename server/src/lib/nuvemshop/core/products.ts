import { BaseClient, nuvemshopApiBase, type BaseClientProps } from "./base";

export type StoreScopedClientProps = BaseClientProps & {
  accessToken: string;
  externalStoreId: string;
};

export type ListProductsProps = {
  page?: number;
  perPage?: number;
};

/**
 * Products resource (api.nuvemshop.com.br). Pagination follows the `Link`
 * response header: read `result.linkHeader` and pass the `rel="next"` URL to
 * `listByUrl` — the exact loop `sync-products` runs.
 */
export class ProductsClient extends BaseClient {
  public externalStoreId: string;

  constructor({ accessToken, externalStoreId, userAgent }: StoreScopedClientProps) {
    super({ accessToken, userAgent });
    this.externalStoreId = externalStoreId;
  }

  get endpoint() {
    return `${nuvemshopApiBase(this.externalStoreId)}/products`;
  }

  list({ page = 1, perPage = 100 }: ListProductsProps = {}) {
    return this.doRequest("GET", `${this.endpoint}?page=${page}&per_page=${perPage}`);
  }

  /** Follow an absolute pagination URL taken from a prior result's `Link` header. */
  listByUrl(url: string) {
    return this.doRequest("GET", url);
  }
}
