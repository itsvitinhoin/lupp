import { BaseClient } from "./base";

/** Webhook configurations registered on the Asaas account. */
export class WebhooksClient extends BaseClient {
  get endpoint() {
    return `${this.apiBase}/webhooks`;
  }

  async list() {
    return this.doRequest("GET", this.endpoint);
  }
}
