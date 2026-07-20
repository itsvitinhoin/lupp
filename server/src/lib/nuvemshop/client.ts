import { OauthClient } from "./core/oauth";
import { ProductsClient, type StoreScopedClientProps } from "./core/products";
import { ScriptsClient } from "./core/scripts";
import { StoreClient } from "./core/store";

export type NuvemshopClientProps = StoreScopedClientProps;

/**
 * Facade over the per-resource sub-clients, mirroring the crm-dzns client
 * pattern. Store-scoped resources share the token/store/User-Agent; `oauth`
 * is token-free and also usable standalone (`new OauthClient()`).
 *
 *   const nuvemshop = new NuvemshopClient({ accessToken, externalStoreId, userAgent });
 *   const scripts = await nuvemshop.scripts.list();
 *   nuvemshop.scripts.lastRequest // inspection buffer, token redacted
 */
export class NuvemshopClient {
  public oauth: OauthClient;
  public products: ProductsClient;
  public scripts: ScriptsClient;
  public store: StoreClient;

  constructor(props: NuvemshopClientProps) {
    this.oauth = new OauthClient();
    this.products = new ProductsClient(props);
    this.scripts = new ScriptsClient(props);
    this.store = new StoreClient(props);
  }
}
