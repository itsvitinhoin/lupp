/**
 * Asaas client (crm-dzns client pattern: core/ sub-clients + facade +
 * inspection buffers, mirroring `lib/nuvemshop`). The flat helpers the
 * billing routes were built on are re-exported unchanged, so `@/lib/asaas`
 * imports keep resolving here.
 */
export * from "./client";
export {
  asaasApiBase,
  asaasCheckoutBaseUrl,
  asaasFetch,
  asaasRequest,
  BaseClient,
  readAsaasError,
  type AsaasApiResult,
  type AsaasEnvironment,
  type BaseClientProps,
} from "./core/base";
export { CheckoutsClient } from "./core/checkouts";
export { CustomersClient } from "./core/customers";
export { FinanceClient } from "./core/finance";
export { InvoicesClient } from "./core/invoices";
export { PaymentsClient } from "./core/payments";
export {
  deleteAsaasSubscription,
  SubscriptionsClient,
} from "./core/subscriptions";
export { WebhooksClient } from "./core/webhooks";
