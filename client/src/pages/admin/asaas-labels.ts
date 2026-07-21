/**
 * pt-BR labels + badge tones for the raw Asaas enum values
 * (docs.asaas.com, API v3). Unknown values fall back to the raw string.
 */

export const ASAAS_PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  RECEIVED: "Recebido",
  CONFIRMED: "Confirmado",
  OVERDUE: "Vencido",
  REFUNDED: "Estornado",
  RECEIVED_IN_CASH: "Recebido em dinheiro",
  REFUND_REQUESTED: "Estorno solicitado",
  REFUND_IN_PROGRESS: "Estorno em andamento",
  CHARGEBACK_REQUESTED: "Chargeback solicitado",
  CHARGEBACK_DISPUTE: "Disputa de chargeback",
  AWAITING_CHARGEBACK_REVERSAL: "Aguardando reversão de chargeback",
  DUNNING_REQUESTED: "Negativação solicitada",
  DUNNING_RECEIVED: "Recuperado por negativação",
  AWAITING_RISK_ANALYSIS: "Em análise de risco",
};

export const ASAAS_BILLING_TYPE_LABELS: Record<string, string> = {
  BOLETO: "Boleto",
  CREDIT_CARD: "Cartão de crédito",
  DEBIT_CARD: "Cartão de débito",
  PIX: "Pix",
  TRANSFER: "Transferência",
  DEPOSIT: "Depósito",
  UNDEFINED: "Não definido",
};

export const ASAAS_SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativa",
  INACTIVE: "Inativa",
  EXPIRED: "Expirada",
};

export const ASAAS_CYCLE_LABELS: Record<string, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY: "Mensal",
  QUARTERLY: "Trimestral",
  SEMIANNUALLY: "Semestral",
  YEARLY: "Anual",
};

export const ASAAS_INVOICE_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Agendada",
  SYNCHRONIZED: "Sincronizada",
  AUTHORIZED: "Autorizada",
  PROCESSING_CANCELLATION: "Cancelamento em processamento",
  CANCELED: "Cancelada",
  CANCELLATION_DENIED: "Cancelamento negado",
  ERROR: "Erro na emissão",
};

export function asaasLabel(map: Record<string, string>, value?: string | null) {
  if (!value) return "—";
  return map[value] ?? value;
}

/** Badge tone classes for any Asaas status enum (payment/subscription/invoice). */
export function asaasStatusTone(status?: string) {
  switch (status) {
    case "RECEIVED":
    case "CONFIRMED":
    case "RECEIVED_IN_CASH":
    case "DUNNING_RECEIVED":
    case "ACTIVE":
    case "AUTHORIZED":
    case "SYNCHRONIZED":
      return "bg-success-surface text-success-surface-foreground border-success-surface-border";
    case "PENDING":
    case "AWAITING_RISK_ANALYSIS":
    case "SCHEDULED":
      return "bg-info-surface text-info-surface-foreground border-info-surface-border";
    case "OVERDUE":
    case "REFUND_REQUESTED":
    case "REFUND_IN_PROGRESS":
    case "DUNNING_REQUESTED":
    case "PROCESSING_CANCELLATION":
      return "bg-warning-surface text-warning-surface-foreground border-warning-surface-border";
    case "REFUNDED":
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
    case "AWAITING_CHARGEBACK_REVERSAL":
    case "INACTIVE":
    case "EXPIRED":
    case "CANCELED":
    case "CANCELLATION_DENIED":
    case "ERROR":
      return "bg-destructive-surface text-destructive border-destructive-surface-border";
    default:
      return "bg-muted/50 text-muted-foreground border-border";
  }
}
