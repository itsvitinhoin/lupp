import { BaseClient, toQueryString } from "./base";

/** Payments resource: individual charges (list/read, offset-paginated). */
export class PaymentsClient extends BaseClient {
  get endpoint() {
    return `${this.apiBase}/payments`;
  }

  async list(params: Record<string, string | number | undefined> = {}) {
    return this.doRequest("GET", `${this.endpoint}${toQueryString(params)}`);
  }

  async get(paymentId: string) {
    return this.doRequest("GET", `${this.endpoint}/${paymentId}`);
  }
}
