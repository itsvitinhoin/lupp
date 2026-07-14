import { FastifyTypedInstance } from "./@types/fastify-type-instance";
import { AuthRoutes } from "./http/auth/routes";
import { HealthRoutes } from "./http/health/routes";
import { BillingRoutes } from "./http/billing/routes";
import { VideoRoutes } from "./http/videos/routes";
import { NuvemshopRoutes } from "./http/nuvemshop/routes";
import { ShopifyRoutes } from "./http/shopify/routes";
import { UpzeroRoutes } from "./http/upzero/routes";
import { WidgetRoutes } from "./http/widget/routes";
import { MasterConsoleRoutes } from "./http/master-console/routes";

export function registerRoutes(app: FastifyTypedInstance) {
  app.register(AuthRoutes);
  app.register(HealthRoutes);
  app.register(BillingRoutes);
  app.register(VideoRoutes);
  app.register(NuvemshopRoutes);
  app.register(ShopifyRoutes);
  app.register(UpzeroRoutes);
  app.register(WidgetRoutes);
  app.register(MasterConsoleRoutes);
}
