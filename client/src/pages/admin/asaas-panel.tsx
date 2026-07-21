import { formatBRL } from "@/lib/utils";
import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyField } from "@/components/shared/CopyField";
import { EmptyState } from "@/components/shared/EmptyState";
import { SectionCard } from "@/components/shared/SectionCard";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { StatCard } from "@/components/shared/StatCard";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { adminConsoleService } from "@/services/admin-console.service";
import type {
  AsaasDailyPoint,
  AsaasListPage,
  AsaasStatistic,
} from "@/types/admin-console";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock3, Search, Wallet } from "lucide-react";
import {
  ASAAS_BILLING_TYPE_LABELS,
  ASAAS_CYCLE_LABELS,
  ASAAS_INVOICE_STATUS_LABELS,
  ASAAS_PAYMENT_STATUS_LABELS,
  ASAAS_SUBSCRIPTION_STATUS_LABELS,
  asaasLabel,
  asaasStatusTone,
} from "./asaas-labels";
import { formatDate, formatNumber } from "./shared";
import { DetailGrid, ExpandableListRow } from "./store/shared";

const WINDOW_OPTIONS = [7, 30, 90] as const;

/**
 * Live view over the Asaas account (admin-gated /api/billing/asaas/*):
 * balance + charge statistics cards, a daily chart, and filterable
 * payments / subscriptions / customers / invoices listings with expandable
 * rows where every value copies on click.
 */
export function AsaasPanel() {
  const [windowDays, setWindowDays] = React.useState<number>(30);

  return (
    <div className="mt-6 grid gap-6">
      <AsaasSummaryCards windowDays={windowDays} />
      <DailyPaymentsChart windowDays={windowDays} onChangeWindow={setWindowDays} />
      <SectionCard
        title="Asaas — conta ao vivo"
        description="Dados lidos diretamente da conta Asaas configurada no servidor. Clique em uma linha para expandir; clique em um valor para copiá-lo."
        contentClassName="gap-4"
      >
        <Tabs defaultValue="payments">
          <TabsList className="mb-2 h-auto flex-wrap justify-start">
            <TabsTrigger value="payments">Pagamentos</TabsTrigger>
            <TabsTrigger value="subscriptions">Assinaturas</TabsTrigger>
            <TabsTrigger value="customers">Clientes</TabsTrigger>
            <TabsTrigger value="invoices">Notas fiscais</TabsTrigger>
          </TabsList>
          <TabsContent value="payments">
            <PaymentsList />
          </TabsContent>
          <TabsContent value="subscriptions">
            <SubscriptionsList />
          </TabsContent>
          <TabsContent value="customers">
            <CustomersList />
          </TabsContent>
          <TabsContent value="invoices">
            <InvoicesList />
          </TabsContent>
        </Tabs>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary cards (balance + GET /finance/payment/statistics slices)
// ---------------------------------------------------------------------------

function statisticValue(statistic: AsaasStatistic | null | undefined) {
  return statistic?.value !== null && statistic?.value !== undefined
    ? formatBRL(statistic.value)
    : "—";
}

function statisticDetail(statistic: AsaasStatistic | null | undefined, suffix: string) {
  if (!statistic) return "Sem dados da Asaas";
  const parts = [
    statistic.quantity !== null ? `${formatNumber(statistic.quantity)} cobrança(s)` : null,
    statistic.netValue !== null ? `líquido ${formatBRL(statistic.netValue)}` : null,
  ].filter(Boolean);
  return [parts.join(" · ") || null, suffix].filter(Boolean).join(" — ");
}

function AsaasSummaryCards({ windowDays }: { windowDays: number }) {
  const accountQuery = useQuery({
    queryKey: ["admin-console", "asaas", "account"],
    queryFn: () => adminConsoleService.getAsaasAccount(),
    retry: false,
  });
  const summaryQuery = useQuery({
    queryKey: ["admin-console", "asaas", "summary", windowDays],
    queryFn: () => adminConsoleService.getAsaasSummary(windowDays),
    retry: false,
  });
  const account = accountQuery.data;
  const summary = summaryQuery.data;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        icon={Wallet}
        isLoading={accountQuery.isPending}
        label="Saldo Asaas"
        value={account && account.balance !== null ? formatBRL(account.balance) : "—"}
        detail={
          accountQuery.error
            ? "Não foi possível consultar a conta."
            : `Ambiente: ${account?.environment ?? "..."} · ${
                account?.webhooks
                  ? `${formatNumber(account.webhooks.filter((w) => w.enabled).length)}/${formatNumber(account.webhooks.length)} webhooks ativos`
                  : "webhooks indisponíveis"
              }`
        }
      />
      <StatCard
        icon={Clock3}
        isLoading={summaryQuery.isPending}
        label="A receber (pendentes)"
        value={statisticValue(summary?.pending)}
        detail={statisticDetail(summary?.pending, "status Pendente")}
      />
      <StatCard
        icon={AlertTriangle}
        isLoading={summaryQuery.isPending}
        label="Vencidas"
        value={statisticValue(summary?.overdue)}
        detail={statisticDetail(summary?.overdue, "status Vencido")}
      />
      <StatCard
        isLoading={summaryQuery.isPending}
        label={`Recebidas (${windowDays} dias)`}
        value={statisticValue(summary?.received)}
        detail={statisticDetail(summary?.received, "criadas na janela")}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Daily chart — one series (total charged per day); count and paid value
// live in the tooltip so the chart keeps a single axis and a single hue.
// ---------------------------------------------------------------------------

const compactBRL = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  style: "currency",
  currency: "BRL",
});

function DailyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: AsaasDailyPoint }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-bold text-foreground">{formatDate(point.date)}</p>
      <p className="mt-1 text-muted-foreground">
        {formatNumber(point.count)} cobrança(s)
      </p>
      <p className="text-muted-foreground">
        Total: <span className="font-bold text-foreground">{formatBRL(point.value)}</span>
      </p>
      <p className="text-muted-foreground">
        Pago:{" "}
        <span className="font-bold text-success">{formatBRL(point.paid_value)}</span>
      </p>
    </div>
  );
}

function DailyPaymentsChart({
  onChangeWindow,
  windowDays,
}: {
  onChangeWindow: (days: number) => void;
  windowDays: number;
}) {
  const dailyQuery = useQuery({
    queryKey: ["admin-console", "asaas", "daily", windowDays],
    queryFn: () => adminConsoleService.getAsaasDailyPayments(windowDays),
    retry: false,
  });
  const series = dailyQuery.data?.series ?? [];
  const hasData = series.some((point) => point.count > 0);

  return (
    <SectionCard
      title="Cobranças por dia"
      description="Valor total das cobranças criadas por dia (contagem e valor pago no detalhe)."
      actions={
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
          {WINDOW_OPTIONS.map((days) => (
            <Button
              key={days}
              size="sm"
              variant={windowDays === days ? "default" : "ghost"}
              className="h-7 px-2 text-xs font-bold"
              onClick={() => onChangeWindow(days)}
            >
              {days} dias
            </Button>
          ))}
        </div>
      }
    >
      {dailyQuery.isPending ? (
        <div className="h-64 animate-pulse rounded-lg bg-muted/50" />
      ) : dailyQuery.error ? (
        <p className="text-sm font-medium text-destructive">
          Não foi possível montar a série diária.
        </p>
      ) : !hasData ? (
        <EmptyState message="Nenhuma cobrança criada no período." />
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ bottom: 0, left: 0, right: 8, top: 8 }}>
              <CartesianGrid
                stroke="hsl(var(--border))"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={(value: string) => value.slice(8, 10) + "/" + value.slice(5, 7)}
                fontSize={12}
                stroke="hsl(var(--muted-foreground))"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={16}
              />
              <YAxis
                tickFormatter={(value: number) => compactBRL.format(value)}
                fontSize={12}
                stroke="hsl(var(--muted-foreground))"
                tickLine={false}
                axisLine={false}
                width={72}
              />
              <Tooltip
                content={<DailyTooltip />}
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
              />
              <Bar
                dataKey="value"
                name="Valor cobrado"
                fill="hsl(var(--chart-1))"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Shared list plumbing (offset pagination + load more)
// ---------------------------------------------------------------------------

function useAsaasList<TItem>(
  key: unknown[],
  fetchPage: (offset: number) => Promise<AsaasListPage<TItem>>,
) {
  const listQuery = useInfiniteQuery({
    queryKey: ["admin-console", "asaas", ...key],
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: (page, _all, lastOffset) =>
      page.hasMore ? lastOffset + (page.limit ?? (page.data.length || 20)) : null,
    retry: false,
  });

  return {
    ...listQuery,
    items: listQuery.data?.pages.flatMap((page) => page.data) ?? [],
    totalCount: listQuery.data?.pages[0]?.totalCount,
  };
}

function ListShell({
  children,
  error,
  hasItems,
  emptyMessage,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  isPending,
  totalCount,
}: {
  children: React.ReactNode;
  emptyMessage: string;
  error: unknown;
  fetchNextPage: () => void;
  hasItems: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isPending: boolean;
  totalCount?: number;
}) {
  return (
    <div className="grid gap-2">
      {typeof totalCount === "number" ? (
        <p className="text-xs font-semibold text-muted-foreground">
          {formatNumber(totalCount)} registro(s) com os filtros atuais
        </p>
      ) : null}
      {isPending ? (
        <SkeletonList />
      ) : error ? (
        <p className="text-sm font-medium text-destructive">
          Não foi possível consultar a Asaas.
        </p>
      ) : !hasItems ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <>
          {children}
          {hasNextPage ? (
            <Button
              variant="outline"
              className="w-fit"
              disabled={isFetchingNextPage}
              onClick={fetchNextPage}
            >
              {isFetchingNextPage ? "Carregando..." : "Carregar mais"}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

function StatusSelect({
  labels,
  onChange,
  value,
}: {
  labels: Record<string, string>;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full bg-card sm:w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos os status</SelectItem>
        {Object.entries(labels).map(([status, label]) => (
          <SelectItem key={status} value={status}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function BillingTypeSelect({
  onChange,
  value,
}: {
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full bg-card sm:w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todas as formas</SelectItem>
        {Object.entries(ASAAS_BILLING_TYPE_LABELS).map(([type, label]) => (
          <SelectItem key={type} value={type}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const PERIOD_OPTIONS = [
  { label: "Qualquer período", value: "all" },
  { label: "Últimos 7 dias", value: "7" },
  { label: "Últimos 30 dias", value: "30" },
  { label: "Últimos 90 dias", value: "90" },
] as const;

function periodStart(period: string) {
  if (period === "all") return undefined;
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (Number(period) - 1));
  return start.toISOString().slice(0, 10);
}

function PeriodSelect({
  onChange,
  value,
}: {
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full bg-card sm:w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PERIOD_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

function PaymentsList() {
  const [status, setStatus] = React.useState("all");
  const [billingType, setBillingType] = React.useState("all");
  const [period, setPeriod] = React.useState("30");
  const list = useAsaasList(["payments", status, billingType, period], (offset) =>
    adminConsoleService.getAsaasPayments({
      offset,
      status: status === "all" ? undefined : status,
      billingType: billingType === "all" ? undefined : billingType,
      dateCreatedGe: periodStart(period),
    }),
  );

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <StatusSelect
          labels={ASAAS_PAYMENT_STATUS_LABELS}
          value={status}
          onChange={setStatus}
        />
        <BillingTypeSelect value={billingType} onChange={setBillingType} />
        <PeriodSelect value={period} onChange={setPeriod} />
      </div>
      <ListShell
        emptyMessage="Nenhum pagamento encontrado."
        error={list.error}
        fetchNextPage={() => void list.fetchNextPage()}
        hasItems={list.items.length > 0}
        hasNextPage={Boolean(list.hasNextPage)}
        isFetchingNextPage={list.isFetchingNextPage}
        isPending={list.isPending}
        totalCount={list.totalCount}
      >
        {list.items.map((payment) => (
          <ExpandableListRow
            key={payment.id}
            summary={
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge className={`border ${asaasStatusTone(payment.status)}`}>
                    {asaasLabel(ASAAS_PAYMENT_STATUS_LABELS, payment.status)}
                  </Badge>
                  <span className="text-sm font-black text-foreground">
                    {payment.value !== undefined ? formatBRL(payment.value) : "—"}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    {asaasLabel(ASAAS_BILLING_TYPE_LABELS, payment.billingType)}
                  </span>
                </div>
                <span className="shrink-0 text-xs font-bold text-muted-foreground">
                  vence {formatDate(payment.dueDate)}
                </span>
              </div>
            }
          >
            <DetailGrid>
              <CopyField label="ID da cobrança" value={payment.id} />
              <CopyField label="Cliente (Asaas)" value={payment.customer} />
              <CopyField label="Assinatura" value={payment.subscription} />
              <CopyField
                label="Referência externa"
                value={(payment as { externalReference?: string }).externalReference}
              />
              <CopyField
                label="Valor"
                mono={false}
                value={payment.value}
                display={payment.value !== undefined ? formatBRL(payment.value) : undefined}
              />
              <CopyField
                label="Valor líquido"
                mono={false}
                value={payment.netValue}
                display={
                  payment.netValue !== undefined ? formatBRL(payment.netValue) : undefined
                }
              />
              <CopyField
                label="Criada em"
                mono={false}
                value={payment.dateCreated}
                display={formatDate(payment.dateCreated)}
              />
              <CopyField
                label="Pagamento"
                mono={false}
                value={payment.paymentDate}
                display={payment.paymentDate ? formatDate(payment.paymentDate) : undefined}
              />
              <CopyField label="Descrição" mono={false} value={payment.description} />
              <CopyField label="Link da fatura" value={payment.invoiceUrl} />
            </DetailGrid>
          </ExpandableListRow>
        ))}
      </ListShell>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

function SubscriptionsList() {
  const [status, setStatus] = React.useState("all");
  const [billingType, setBillingType] = React.useState("all");
  const list = useAsaasList(["subscriptions", status, billingType], (offset) =>
    adminConsoleService.getAsaasSubscriptions({
      offset,
      status: status === "all" ? undefined : status,
      billingType: billingType === "all" ? undefined : billingType,
    }),
  );

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <StatusSelect
          labels={ASAAS_SUBSCRIPTION_STATUS_LABELS}
          value={status}
          onChange={setStatus}
        />
        <BillingTypeSelect value={billingType} onChange={setBillingType} />
      </div>
      <ListShell
        emptyMessage="Nenhuma assinatura encontrada."
        error={list.error}
        fetchNextPage={() => void list.fetchNextPage()}
        hasItems={list.items.length > 0}
        hasNextPage={Boolean(list.hasNextPage)}
        isFetchingNextPage={list.isFetchingNextPage}
        isPending={list.isPending}
        totalCount={list.totalCount}
      >
        {list.items.map((subscription) => (
          <ExpandableListRow
            key={subscription.id}
            summary={
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge
                    className={`border ${asaasStatusTone(subscription.status)}`}
                  >
                    {asaasLabel(ASAAS_SUBSCRIPTION_STATUS_LABELS, subscription.status)}
                  </Badge>
                  <span className="text-sm font-black text-foreground">
                    {subscription.value !== undefined
                      ? formatBRL(subscription.value)
                      : "—"}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    {asaasLabel(ASAAS_CYCLE_LABELS, subscription.cycle)}
                  </span>
                </div>
                <span className="shrink-0 text-xs font-bold text-muted-foreground">
                  próx. cobrança {formatDate(subscription.nextDueDate)}
                </span>
              </div>
            }
          >
            <DetailGrid>
              <CopyField label="ID da assinatura" value={subscription.id} />
              <CopyField label="Cliente (Asaas)" value={subscription.customer} />
              <CopyField
                label="Referência externa"
                value={subscription.externalReference}
              />
              <CopyField
                label="Forma de pagamento"
                mono={false}
                value={subscription.billingType}
                display={asaasLabel(ASAAS_BILLING_TYPE_LABELS, subscription.billingType)}
              />
              <CopyField
                label="Valor"
                mono={false}
                value={subscription.value}
                display={
                  subscription.value !== undefined
                    ? formatBRL(subscription.value)
                    : undefined
                }
              />
              <CopyField
                label="Criada em"
                mono={false}
                value={subscription.dateCreated}
                display={formatDate(subscription.dateCreated)}
              />
              <CopyField label="Descrição" mono={false} value={subscription.description} />
            </DetailGrid>
          </ExpandableListRow>
        ))}
      </ListShell>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

function CustomersList() {
  const [nameInput, setNameInput] = React.useState("");
  const name = useDebouncedValue(nameInput.trim());
  const list = useAsaasList(["customers", name], (offset) =>
    adminConsoleService.getAsaasCustomers({ name: name || undefined, offset }),
  );

  return (
    <div className="grid gap-3">
      <div className="relative sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
        <Input
          value={nameInput}
          onChange={(event) => setNameInput(event.target.value)}
          placeholder="Buscar cliente por nome"
          className="bg-card pl-9"
        />
      </div>
      <ListShell
        emptyMessage="Nenhum cliente encontrado."
        error={list.error}
        fetchNextPage={() => void list.fetchNextPage()}
        hasItems={list.items.length > 0}
        hasNextPage={Boolean(list.hasNextPage)}
        isFetchingNextPage={list.isFetchingNextPage}
        isPending={list.isPending}
        totalCount={list.totalCount}
      >
        {list.items.map((customer) => (
          <ExpandableListRow
            key={customer.id}
            summary={
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-bold text-foreground">
                  {customer.name || customer.id}
                </p>
                <span className="shrink-0 text-xs font-bold text-muted-foreground">
                  desde {formatDate(customer.dateCreated)}
                </span>
              </div>
            }
          >
            <DetailGrid>
              <CopyField label="ID do cliente" value={customer.id} />
              <CopyField label="Nome" mono={false} value={customer.name} />
              <CopyField label="E-mail" value={customer.email} />
              <CopyField label="CPF/CNPJ" value={customer.cpfCnpj} />
              <CopyField label="Celular" value={customer.mobilePhone} />
              <CopyField
                label="Referência externa"
                value={customer.externalReference}
              />
            </DetailGrid>
          </ExpandableListRow>
        ))}
      </ListShell>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invoices (notas fiscais)
// ---------------------------------------------------------------------------

function InvoicesList() {
  const [status, setStatus] = React.useState("all");
  const [period, setPeriod] = React.useState("all");
  const list = useAsaasList(["invoices", status, period], (offset) =>
    adminConsoleService.getAsaasInvoices({
      offset,
      status: status === "all" ? undefined : status,
      effectiveDateGe: periodStart(period),
    }),
  );

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <StatusSelect
          labels={ASAAS_INVOICE_STATUS_LABELS}
          value={status}
          onChange={setStatus}
        />
        <PeriodSelect value={period} onChange={setPeriod} />
      </div>
      <ListShell
        emptyMessage="Nenhuma nota fiscal encontrada."
        error={list.error}
        fetchNextPage={() => void list.fetchNextPage()}
        hasItems={list.items.length > 0}
        hasNextPage={Boolean(list.hasNextPage)}
        isFetchingNextPage={list.isFetchingNextPage}
        isPending={list.isPending}
        totalCount={list.totalCount}
      >
        {list.items.map((invoice) => (
          <ExpandableListRow
            key={invoice.id}
            summary={
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge className={`border ${asaasStatusTone(invoice.status)}`}>
                    {asaasLabel(ASAAS_INVOICE_STATUS_LABELS, invoice.status)}
                  </Badge>
                  <span className="text-sm font-black text-foreground">
                    {invoice.value !== undefined ? formatBRL(invoice.value) : "—"}
                  </span>
                  <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">
                    {invoice.number ? `nº ${invoice.number}` : invoice.serviceDescription || invoice.id}
                  </span>
                </div>
                <span className="shrink-0 text-xs font-bold text-muted-foreground">
                  emitida {formatDate(invoice.effectiveDate)}
                </span>
              </div>
            }
          >
            <DetailGrid>
              <CopyField label="ID da nota" value={invoice.id} />
              <CopyField label="Número" value={invoice.number} />
              <CopyField label="Número do RPS" value={invoice.rpsNumber} />
              <CopyField label="Pagamento (Asaas)" value={invoice.payment} />
              <CopyField label="Cliente (Asaas)" value={invoice.customer} />
              <CopyField
                label="Referência externa"
                value={invoice.externalReference}
              />
              <CopyField
                label="Valor"
                mono={false}
                value={invoice.value}
                display={invoice.value !== undefined ? formatBRL(invoice.value) : undefined}
              />
              <CopyField
                label="Emitida em"
                mono={false}
                value={invoice.effectiveDate}
                display={formatDate(invoice.effectiveDate)}
              />
              <CopyField
                label="Descrição do serviço"
                mono={false}
                value={invoice.serviceDescription}
              />
              <CopyField label="PDF" value={invoice.pdfUrl} />
              <CopyField label="XML" value={invoice.xmlUrl} />
            </DetailGrid>
          </ExpandableListRow>
        ))}
      </ListShell>
    </div>
  );
}
