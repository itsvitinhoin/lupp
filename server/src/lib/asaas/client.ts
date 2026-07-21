import { type BaseClientProps } from "./core/base";
import { CheckoutsClient } from "./core/checkouts";
import { CustomersClient } from "./core/customers";
import { FinanceClient } from "./core/finance";
import { InvoicesClient } from "./core/invoices";
import { PaymentsClient } from "./core/payments";
import { SubscriptionsClient } from "./core/subscriptions";
import { WebhooksClient } from "./core/webhooks";

export type AsaasClientProps = BaseClientProps;

/**
 * Facade over the per-resource sub-clients, mirroring the crm-dzns client
 * pattern (`lib/nuvemshop`). All resources share the API key/environment
 * (both default to env at request time, so the zero-arg form works):
 *
 *   const asaas = new AsaasClient();
 *   const result = await asaas.subscriptions.create({ ... });
 *   asaas.subscriptions.lastRequest // inspection buffer, API key redacted
 */
export class AsaasClient {
  public checkouts: CheckoutsClient;
  public customers: CustomersClient;
  public finance: FinanceClient;
  public invoices: InvoicesClient;
  public payments: PaymentsClient;
  public subscriptions: SubscriptionsClient;
  public webhooks: WebhooksClient;

  constructor(props: AsaasClientProps = {}) {
    this.checkouts = new CheckoutsClient(props);
    this.customers = new CustomersClient(props);
    this.finance = new FinanceClient(props);
    this.invoices = new InvoicesClient(props);
    this.payments = new PaymentsClient(props);
    this.subscriptions = new SubscriptionsClient(props);
    this.webhooks = new WebhooksClient(props);
  }
}
