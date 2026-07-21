import { FastifyTypedInstance } from "@/@types/fastify-type-instance";
import { verifyJwt } from "@/middlewares/verify-jwt";
import { changeTrialPlanHandler, ChangeTrialPlanSchema } from "./change-trial-plan";
import { createSubscriptionHandler, CreateSubscriptionSchema } from "./create-subscription";
import { createCheckoutHandler, CreateCheckoutSchema } from "./create-checkout";
import { changePlanHandler, ChangePlanSchema } from "./change-plan";
import { cancelSubscriptionHandler, CancelSubscriptionSchema } from "./cancel-subscription";
import { asaasWebhookHandler, AsaasWebhookSchema } from "./asaas-webhook";
import {
  asaasAccountHandler,
  AsaasAccountSchema,
  asaasCustomersHandler,
  AsaasCustomersSchema,
  asaasDailyPaymentsHandler,
  AsaasDailyPaymentsSchema,
  asaasInvoicesHandler,
  AsaasInvoicesSchema,
  asaasPaymentsHandler,
  AsaasPaymentsSchema,
  asaasSubscriptionsHandler,
  AsaasSubscriptionsSchema,
  asaasSummaryHandler,
  AsaasSummarySchema,
} from "./asaas-admin";
import { verifyUserRole } from "@/middlewares/verify-user-role";
import { getSubscriptionHandler, GetSubscriptionSchema } from "./get-subscription";
import { getUsageHandler, GetUsageSchema } from "./get-usage";
import { getCouponHandler, GetCouponSchema } from "./get-coupon";

export async function BillingRoutes(app: FastifyTypedInstance) {
  app.get(
    "/api/billing/subscription",
    { schema: GetSubscriptionSchema.schema, preHandler: [verifyJwt] },
    getSubscriptionHandler,
  );

  app.get(
    "/api/billing/usage",
    { schema: GetUsageSchema.schema, preHandler: [verifyJwt] },
    getUsageHandler,
  );

  app.get(
    "/api/billing/coupons/:code",
    { schema: GetCouponSchema.schema, preHandler: [verifyJwt] },
    getCouponHandler,
  );

  app.post(
    "/api/billing/trial-plan",
    { schema: ChangeTrialPlanSchema.schema, preHandler: [verifyJwt] },
    changeTrialPlanHandler,
  );

  app.post(
    "/api/billing/subscriptions",
    { schema: CreateSubscriptionSchema.schema, preHandler: [verifyJwt] },
    createSubscriptionHandler,
  );

  app.post(
    "/api/billing/checkout",
    { schema: CreateCheckoutSchema.schema, preHandler: [verifyJwt] },
    createCheckoutHandler,
  );

  app.post(
    "/api/billing/change-plan",
    { schema: ChangePlanSchema.schema, preHandler: [verifyJwt] },
    changePlanHandler,
  );

  app.post(
    "/api/billing/cancel-subscription",
    { schema: CancelSubscriptionSchema.schema, preHandler: [verifyJwt] },
    cancelSubscriptionHandler,
  );

  // Asaas calls this directly — authenticated by the webhook token, not a JWT.
  app.post(
    "/api/webhooks/asaas",
    { schema: AsaasWebhookSchema.schema },
    asaasWebhookHandler,
  );

  // Admin-console reads over the live Asaas account (role-gated).
  const adminPreHandler = [verifyJwt, verifyUserRole("admin")];
  app.get(
    "/api/billing/asaas/account",
    { schema: AsaasAccountSchema.schema, preHandler: adminPreHandler },
    asaasAccountHandler,
  );
  app.get(
    "/api/billing/asaas/payments",
    { schema: AsaasPaymentsSchema.schema, preHandler: adminPreHandler },
    asaasPaymentsHandler,
  );
  app.get(
    "/api/billing/asaas/customers",
    { schema: AsaasCustomersSchema.schema, preHandler: adminPreHandler },
    asaasCustomersHandler,
  );
  app.get(
    "/api/billing/asaas/subscriptions",
    { schema: AsaasSubscriptionsSchema.schema, preHandler: adminPreHandler },
    asaasSubscriptionsHandler,
  );
  app.get(
    "/api/billing/asaas/invoices",
    { schema: AsaasInvoicesSchema.schema, preHandler: adminPreHandler },
    asaasInvoicesHandler,
  );
  app.get(
    "/api/billing/asaas/summary",
    { schema: AsaasSummarySchema.schema, preHandler: adminPreHandler },
    asaasSummaryHandler,
  );
  app.get(
    "/api/billing/asaas/payments/daily",
    { schema: AsaasDailyPaymentsSchema.schema, preHandler: adminPreHandler },
    asaasDailyPaymentsHandler,
  );
}
