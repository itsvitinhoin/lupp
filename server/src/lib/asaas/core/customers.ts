import { BaseClient, toQueryString } from "./base";

/** Customers resource: payer records subscriptions/checkouts attach to. */
export class CustomersClient extends BaseClient {
  get endpoint() {
    return `${this.apiBase}/customers`;
  }

  async create(payload: Record<string, unknown>) {
    return this.doRequest("POST", this.endpoint, payload);
  }

  async list(params: Record<string, string | number | undefined> = {}) {
    return this.doRequest("GET", `${this.endpoint}${toQueryString(params)}`);
  }

  async get(customerId: string) {
    return this.doRequest("GET", `${this.endpoint}/${customerId}`);
  }
}
