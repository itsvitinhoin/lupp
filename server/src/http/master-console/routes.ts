import { FastifyTypedInstance } from "@/@types/fastify-type-instance";
import { verifyJwt } from "@/middlewares/verify-jwt";
import { masterConsoleActionHandler, MasterConsoleActionSchema } from "./actions";
import { masterConsoleSnapshotHandler, MasterConsoleSnapshotSchema } from "./snapshot";

export async function MasterConsoleRoutes(app: FastifyTypedInstance) {
  app.get(
    "/api/master-console",
    { schema: MasterConsoleSnapshotSchema.schema, preHandler: [verifyJwt] },
    masterConsoleSnapshotHandler,
  );
  app.post(
    "/api/master-console",
    { schema: MasterConsoleActionSchema.schema, preHandler: [verifyJwt] },
    masterConsoleActionHandler,
  );
}
