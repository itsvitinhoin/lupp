import { BaseClient, toQueryString } from "./base";

/** Fiscal invoices (notas fiscais de serviço) issued through Asaas. */
export class InvoicesClient extends BaseClient {
  get endpoint() {
    return `${this.apiBase}/invoices`;
  }

  async list(params: Record<string, string | number | undefined> = {}) {
    return this.doRequest("GET", `${this.endpoint}${toQueryString(params)}`);
  }
}
