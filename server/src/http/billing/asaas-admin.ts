import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { env } from "@/env";
import { AsaasClient, type AsaasApiResult } from "@/lib/asaas";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { requireAdmin } from "../admin-console/admin-gate";

// Admin-console reads over the LIVE Asaas account: balance/webhooks, charge
// statistics, a daily series, and payments/subscriptions/customers/invoices
// listings. Role-gated like the admin console (verifyUserRole("admin") at the
// route + requireAdmin fresh-DB check here). Filters mirror the Asaas v3
// query surface (docs.asaas.com) — flat `*Ge`/`*Le` params here become the
// bracket params (`dueDate[ge]`) Asaas expects. List responses pass through
// verbatim ({ data, hasMore, totalCount, limit, offset }).

const ListQuerySchema = z.object({
  offset: z.coerce.number().optional().describe("Offset (Asaas pagination)."),
  limit: z.coerce.number().optional().describe("Page size (default 20, max 100)."),
});

const PaymentsQuerySchema = ListQuerySchema.extend({
  status: z.string().optional().describe("Asaas payment status (PENDING, RECEIVED...)."),
  billingType: z.string().optional().describe("BOLETO | CREDIT_CARD | PIX | UNDEFINED."),
  customer: z.string().optional().describe("Filter by Asaas customer id."),
  subscription: z.string().optional().describe("Filter by Asaas subscription id."),
  externalReference: z.string().optional().describe("Filter by external reference."),
  dateCreatedGe: z.string().optional().describe("dateCreated[ge] (YYYY-MM-DD)."),
  dateCreatedLe: z.string().optional().describe("dateCreated[le] (YYYY-MM-DD)."),
  dueDateGe: z.string().optional().describe("dueDate[ge] (YYYY-MM-DD)."),
  dueDateLe: z.string().optional().describe("dueDate[le] (YYYY-MM-DD)."),
  paymentDateGe: z.string().optional().describe("paymentDate[ge] (YYYY-MM-DD)."),
  paymentDateLe: z.string().optional().describe("paymentDate[le] (YYYY-MM-DD)."),
});

const CustomersQuerySchema = ListQuerySchema.extend({
  name: z.string().optional().describe("Filter by (partial) name."),
  email: z.string().optional().describe("Filter by e-mail."),
  cpfCnpj: z.string().optional().describe("Filter by CPF/CNPJ."),
  externalReference: z.string().optional().describe("Filter by external reference."),
});

const SubscriptionsQuerySchema = ListQuerySchema.extend({
  status: z.string().optional().describe("ACTIVE | INACTIVE | EXPIRED."),
  billingType: z.string().optional().describe("Filter by billing type."),
  customer: z.string().optional().describe("Filter by Asaas customer id."),
  externalReference: z.string().optional().describe("Filter by external reference."),
});

const InvoicesQuerySchema = ListQuerySchema.extend({
  status: z
    .string()
    .optional()
    .describe("SCHEDULED | SYNCHRONIZED | AUTHORIZED | PROCESSING_CANCELLATION | CANCELED | CANCELLATION_DENIED | ERROR."),
  customer: z.string().optional().describe("Filter by Asaas customer id."),
  payment: z.string().optional().describe("Filter by Asaas payment id."),
  externalReference: z.string().optional().describe("Filter by external reference."),
  effectiveDateGe: z.string().optional().describe("effectiveDate[ge] (YYYY-MM-DD)."),
  effectiveDateLe: z.string().optional().describe("effectiveDate[le] (YYYY-MM-DD)."),
});

const DaysQuerySchema = z.object({
  days: z.coerce.number().optional().describe("Window in days (default 30, max 90)."),
});

const listResponse = z.object({ data: z.array(z.any()) }).loose();

function listSchema(summary: string, operationId: string, querystring: z.ZodTypeAny) {
  return {
    schema: {
      summary,
      description:
        `${summary} straight from the Asaas account (offset pagination passed ` +
        "through). Caller's account must hold the admin role.",
      tags: ["billing"],
      operationId,
      security: [{ bearerAuth: [] }],
      querystring,
      response: { 200: listResponse, ...edgeErrorSchemas },
    },
  };
}

export const AsaasAccountSchema = {
  schema: {
    summary: "Asaas account overview",
    description:
      "Environment, current balance and the webhook configurations registered " +
      "on the Asaas account. Parts that fail upstream come back null instead " +
      "of failing the whole overview. Caller's account must hold the admin role.",
    tags: ["billing"],
    operationId: "getAsaasAccountOverview",
    security: [{ bearerAuth: [] }],
    response: {
      200: z
        .object({
          environment: z.string(),
          balance: z.number().nullable(),
          webhooks: z.array(z.any()).nullable(),
        })
        .loose(),
      ...edgeErrorSchemas,
    },
  },
};

const statisticSchema = z
  .object({
    quantity: z.number().nullable(),
    value: z.number().nullable(),
    netValue: z.number().nullable(),
  })
  .loose()
  .nullable();

export const AsaasSummarySchema = {
  schema: {
    summary: "Asaas charge statistics summary",
    description:
      "Charge totals from GET /finance/payment/statistics: pending (a receber), " +
      "overdue (vencidas) and received within the window. Parts that fail " +
      "upstream come back null. Caller's account must hold the admin role.",
    tags: ["billing"],
    operationId: "getAsaasSummary",
    security: [{ bearerAuth: [] }],
    querystring: DaysQuerySchema,
    response: {
      200: z
        .object({
          days: z.number(),
          pending: statisticSchema,
          overdue: statisticSchema,
          received: statisticSchema,
        })
        .loose(),
      ...edgeErrorSchemas,
    },
  },
};

export const AsaasDailyPaymentsSchema = {
  schema: {
    summary: "Asaas daily payment series",
    description:
      "Charges created in the window bucketed per day (count, total value and " +
      "the value already paid), zero-filled for empty days — built from " +
      "paginated GET /payments reads. Caller's account must hold the admin role.",
    tags: ["billing"],
    operationId: "getAsaasDailyPayments",
    security: [{ bearerAuth: [] }],
    querystring: DaysQuerySchema,
    response: {
      200: z
        .object({
          days: z.number(),
          series: z.array(
            z
              .object({
                date: z.string(),
                count: z.number(),
                value: z.number(),
                paid_value: z.number(),
              })
              .loose(),
          ),
        })
        .loose(),
      ...edgeErrorSchemas,
    },
  },
};

export const AsaasPaymentsSchema = listSchema(
  "List Asaas payments",
  "listAsaasPayments",
  PaymentsQuerySchema,
);
export const AsaasCustomersSchema = listSchema(
  "List Asaas customers",
  "listAsaasCustomers",
  CustomersQuerySchema,
);
export const AsaasSubscriptionsSchema = listSchema(
  "List Asaas subscriptions",
  "listAsaasSubscriptions",
  SubscriptionsQuerySchema,
);
export const AsaasInvoicesSchema = listSchema(
  "List Asaas invoices (notas fiscais)",
  "listAsaasInvoices",
  InvoicesQuerySchema,
);

/** Gate + configured-key check; sends the error reply itself on failure. */
async function prepare(request: FastifyRequest, reply: FastifyReply) {
  const gate = await requireAdmin(request.user.sub);
  if ("error" in gate) {
    await reply.status(gate.status).send({ error: gate.error });
    return null;
  }
  if (!env.ASAAS_API_KEY) {
    await reply.status(500).send({ error: "missing_asaas_api_key" });
    return null;
  }
  return new AsaasClient();
}

function clampLimit(limit?: number) {
  return Math.max(1, Math.min(limit ?? 20, 100));
}

function clampDays(days?: number) {
  return Math.max(1, Math.min(days ?? 30, 90));
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function windowStart(days: number) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start;
}

async function sendListResult(reply: FastifyReply, result: AsaasApiResult) {
  if (!result.ok) {
    return reply
      .status(502)
      .send({ error: result.errorMessage ?? "asaas_request_failed" });
  }
  return reply.status(200).send(result.data);
}

export async function asaasAccountHandler(request: FastifyRequest, reply: FastifyReply) {
  const asaas = await prepare(request, reply);
  if (!asaas) return;

  // Independent reads: a failing part becomes null, the overview still loads.
  const [balanceResult, webhooksResult] = await Promise.all([
    asaas.finance.balance().catch(() => null),
    asaas.webhooks.list().catch(() => null),
  ]);

  const balanceData =
    balanceResult?.ok && balanceResult.data
      ? (balanceResult.data as { balance?: unknown })
      : null;
  const webhooksData =
    webhooksResult?.ok && webhooksResult.data
      ? (webhooksResult.data as { data?: unknown[] })
      : null;

  return reply.status(200).send({
    environment: env.ASAAS_ENVIRONMENT,
    balance:
      balanceData && typeof balanceData.balance === "number"
        ? balanceData.balance
        : null,
    webhooks: Array.isArray(webhooksData?.data) ? webhooksData.data : null,
  });
}

function pickStatistic(result: AsaasApiResult | null) {
  if (!result?.ok || !result.data) return null;
  const body = result.data as Record<string, unknown>;
  const numberOrNull = (value: unknown) =>
    typeof value === "number" ? value : null;
  return {
    quantity: numberOrNull(body.quantity),
    value: numberOrNull(body.value),
    netValue: numberOrNull(body.netValue),
  };
}

export async function asaasSummaryHandler(request: FastifyRequest, reply: FastifyReply) {
  const asaas = await prepare(request, reply);
  if (!asaas) return;

  const days = clampDays(DaysQuerySchema.parse(request.query ?? {}).days);
  const since = isoDay(windowStart(days));

  const [pending, overdue, received] = await Promise.all([
    asaas.finance.paymentStatistics({ status: "PENDING" }).catch(() => null),
    asaas.finance.paymentStatistics({ status: "OVERDUE" }).catch(() => null),
    asaas.finance
      .paymentStatistics({ status: "RECEIVED", "dateCreated[ge]": since })
      .catch(() => null),
  ]);

  return reply.status(200).send({
    days,
    pending: pickStatistic(pending),
    overdue: pickStatistic(overdue),
    received: pickStatistic(received),
  });
}

const PAID_STATUSES = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);
const DAILY_PAGE_LIMIT = 100;
const DAILY_MAX_PAGES = 5;

export async function asaasDailyPaymentsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const asaas = await prepare(request, reply);
  if (!asaas) return;

  const days = clampDays(DaysQuerySchema.parse(request.query ?? {}).days);
  const start = windowStart(days);

  type PaymentRow = {
    dateCreated?: string;
    status?: string;
    value?: number;
  };

  const rows: PaymentRow[] = [];
  for (let page = 0; page < DAILY_MAX_PAGES; page += 1) {
    const result = await asaas.payments.list({
      "dateCreated[ge]": isoDay(start),
      limit: DAILY_PAGE_LIMIT,
      offset: page * DAILY_PAGE_LIMIT,
    });
    if (!result.ok) {
      return reply
        .status(502)
        .send({ error: result.errorMessage ?? "asaas_request_failed" });
    }
    const body = result.data as { data?: PaymentRow[]; hasMore?: boolean };
    rows.push(...(Array.isArray(body.data) ? body.data : []));
    if (!body.hasMore) break;
  }

  const buckets = new Map<string, { count: number; paid_value: number; value: number }>();
  for (let day = 0; day < days; day += 1) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + day);
    buckets.set(isoDay(date), { count: 0, paid_value: 0, value: 0 });
  }
  for (const row of rows) {
    const day = String(row.dateCreated ?? "").slice(0, 10);
    const bucket = buckets.get(day);
    if (!bucket) continue;
    const value = typeof row.value === "number" ? row.value : 0;
    bucket.count += 1;
    bucket.value += value;
    if (PAID_STATUSES.has(String(row.status ?? ""))) bucket.paid_value += value;
  }

  return reply.status(200).send({
    days,
    series: Array.from(buckets.entries()).map(([date, bucket]) => ({
      date,
      ...bucket,
    })),
  });
}

export async function asaasPaymentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const asaas = await prepare(request, reply);
  if (!asaas) return;

  const query = PaymentsQuerySchema.parse(request.query ?? {});
  const result = await asaas.payments.list({
    offset: query.offset ?? 0,
    limit: clampLimit(query.limit),
    status: query.status,
    billingType: query.billingType,
    customer: query.customer,
    subscription: query.subscription,
    externalReference: query.externalReference,
    "dateCreated[ge]": query.dateCreatedGe,
    "dateCreated[le]": query.dateCreatedLe,
    "dueDate[ge]": query.dueDateGe,
    "dueDate[le]": query.dueDateLe,
    "paymentDate[ge]": query.paymentDateGe,
    "paymentDate[le]": query.paymentDateLe,
  });
  return sendListResult(reply, result);
}

export async function asaasCustomersHandler(request: FastifyRequest, reply: FastifyReply) {
  const asaas = await prepare(request, reply);
  if (!asaas) return;

  const query = CustomersQuerySchema.parse(request.query ?? {});
  const result = await asaas.customers.list({
    offset: query.offset ?? 0,
    limit: clampLimit(query.limit),
    name: query.name,
    email: query.email,
    cpfCnpj: query.cpfCnpj,
    externalReference: query.externalReference,
  });
  return sendListResult(reply, result);
}

export async function asaasSubscriptionsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const asaas = await prepare(request, reply);
  if (!asaas) return;

  const query = SubscriptionsQuerySchema.parse(request.query ?? {});
  const result = await asaas.subscriptions.list({
    offset: query.offset ?? 0,
    limit: clampLimit(query.limit),
    status: query.status,
    billingType: query.billingType,
    customer: query.customer,
    externalReference: query.externalReference,
  });
  return sendListResult(reply, result);
}

export async function asaasInvoicesHandler(request: FastifyRequest, reply: FastifyReply) {
  const asaas = await prepare(request, reply);
  if (!asaas) return;

  const query = InvoicesQuerySchema.parse(request.query ?? {});
  const result = await asaas.invoices.list({
    offset: query.offset ?? 0,
    limit: clampLimit(query.limit),
    status: query.status,
    customer: query.customer,
    payment: query.payment,
    externalReference: query.externalReference,
    "effectiveDate[ge]": query.effectiveDateGe,
    "effectiveDate[le]": query.effectiveDateLe,
  });
  return sendListResult(reply, result);
}
