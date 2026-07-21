import { BaseClient, toQueryString } from "./base";

/** Finance resource: account-level financial reads. */
export class FinanceClient extends BaseClient {
  get endpoint() {
    return `${this.apiBase}/finance`;
  }

  /** Current account balance ({ balance: number }). */
  async balance() {
    return this.doRequest("GET", `${this.endpoint}/balance`);
  }

  /**
   * Charge totals ({ quantity, value, netValue }) filtered by status,
   * billingType, customer, externalReference and dateCreated/dueDate/
   * estimatedCreditDate ranges (bracket params, e.g. "dueDate[ge]").
   */
  async paymentStatistics(params: Record<string, string | number | undefined> = {}) {
    return this.doRequest(
      "GET",
      `${this.endpoint}/payment/statistics${toQueryString(params)}`,
    );
  }
}
