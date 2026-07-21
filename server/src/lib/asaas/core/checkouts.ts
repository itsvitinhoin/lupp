import { asaasCheckoutBaseUrl, BaseClient } from "./base";

/** Checkout sessions resource: hosted payment pages. */
export class CheckoutsClient extends BaseClient {
  get endpoint() {
    return `${this.apiBase}/checkouts`;
  }

  async create(payload: Record<string, unknown>) {
    return this.doRequest("POST", this.endpoint, payload);
  }

  /** Redirect URL for a created checkout session id. */
  checkoutUrl(checkoutId: string) {
    return `${asaasCheckoutBaseUrl(this.environment)}?id=${encodeURIComponent(checkoutId)}`;
  }
}
