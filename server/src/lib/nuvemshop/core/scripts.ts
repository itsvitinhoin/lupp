import { BaseClient, nuvemshopScriptsApiBase } from "./base";
import type { StoreScopedClientProps } from "./products";

export type NuvemshopScript = {
  id?: number | string;
  handle?: string;
  name?: string;
  src?: string;
  [key: string]: unknown;
};

export type ListScriptsProps = {
  page?: number;
  perPage?: number;
};

/**
 * Scripts resource — NOTE the different host (api.tiendanube.com, matching
 * the original edge functions). Script *sources* live in the Partners portal;
 * this API manages per-store installations and their `query_params`/`script_id`.
 */
export class ScriptsClient extends BaseClient {
  public externalStoreId: string;

  constructor({ accessToken, externalStoreId, userAgent }: StoreScopedClientProps) {
    super({ accessToken, userAgent });
    this.externalStoreId = externalStoreId;
  }

  get endpoint() {
    return nuvemshopScriptsApiBase(this.externalStoreId);
  }

  list({ page = 1, perPage = 100 }: ListScriptsProps = {}) {
    return this.doRequest("GET", `${this.endpoint}?page=${page}&per_page=${perPage}`);
  }

  create(body: Record<string, unknown>) {
    return this.doRequest("POST", this.endpoint, body);
  }

  update(installationId: string, body: Record<string, unknown>) {
    return this.doRequest("PUT", `${this.endpoint}/${installationId}`, body);
  }
}
