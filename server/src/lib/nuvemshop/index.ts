/**
 * Nuvemshop/Tiendanube client (crm-dzns client pattern: core/ sub-clients +
 * facade + inspection buffers). The flat helpers the nuvemshop routes were
 * built on are re-exported unchanged, so `@/lib/nuvemshop` imports keep
 * resolving here.
 */
export * from "./client";
export {
  BaseClient,
  NUVEMSHOP_API_VERSION,
  nuvemshopApiBase,
  nuvemshopRequest,
  nuvemshopScriptsApiBase,
  type NuvemshopApiResult,
} from "./core/base";
export {
  exchangeNuvemshopToken,
  NUVEMSHOP_TOKEN_URL,
  nuvemshopAppId,
  OauthClient,
  type NuvemshopTokenResponse,
} from "./core/oauth";
export { ProductsClient, type StoreScopedClientProps } from "./core/products";
export { ScriptsClient, type NuvemshopScript } from "./core/scripts";
export { StoreClient, type NuvemshopStoreInfo } from "./core/store";
export {
  signNuvemshopState,
  verifyNuvemshopState,
  type NuvemshopStatePayload,
} from "./core/state";
