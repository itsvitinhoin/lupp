import { FastifyTypedInstance } from "@/@types/fastify-type-instance";
import { verifyJwt } from "@/middlewares/verify-jwt";
import { changeTrialPlanHandler, ChangeTrialPlanSchema } from "./change-trial-plan";
import { createSubscriptionHandler, CreateSubscriptionSchema } from "./create-subscription";
import { createCheckoutHandler, CreateCheckoutSchema } from "./create-checkout";
import { changePlanHandler, ChangePlanSchema } from "./change-plan";
import { cancelSubscriptionHandler, CancelSubscriptionSchema } from "./cancel-subscription";
import { asaasWebhookHandler, AsaasWebhookSchema } from "./asaas-webhook";

export async function BillingRoutes(app: FastifyTypedInstance) {
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
}
