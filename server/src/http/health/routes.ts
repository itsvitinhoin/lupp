import { FastifyTypedInstance } from "@/@types/fastify-type-instance";
import { getHealthHandler, GetHealthSchema } from "./get-health";

export async function HealthRoutes(app: FastifyTypedInstance) {
  app.get("/health", { schema: GetHealthSchema.schema }, getHealthHandler);
}
