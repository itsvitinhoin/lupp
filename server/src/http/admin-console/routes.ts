import { FastifyTypedInstance } from "@/@types/fastify-type-instance";
import { verifyJwt } from "@/middlewares/verify-jwt";
import { verifyUserRole } from "@/middlewares/verify-user-role";
import { adminConsoleActionHandler, AdminConsoleActionSchema } from "./actions";
import {
  adminConsoleBunnyDeleteVideoHandler,
  AdminConsoleBunnyDeleteVideoSchema,
  adminConsoleBunnyStoresHandler,
  AdminConsoleBunnyStoresSchema,
  adminConsoleBunnySummaryHandler,
  AdminConsoleBunnySummarySchema,
  adminConsoleBunnyVideosHandler,
  AdminConsoleBunnyVideosSchema,
} from "./bunny";
import { adminConsoleSnapshotHandler, AdminConsoleSnapshotSchema } from "./snapshot";
import {
  adminConsoleStoreDetailHandler,
  AdminConsoleStoreDetailSchema,
} from "./store-detail";
import {
  adminConsoleStoreEventsHandler,
  AdminConsoleStoreEventsSchema,
} from "./store-events";
import {
  adminConsoleStoreCommentsHandler,
  AdminConsoleStoreCommentsSchema,
  adminConsoleStoreProductsHandler,
  AdminConsoleStoreProductsSchema,
  adminConsoleStoreVideosHandler,
  AdminConsoleStoreVideosSchema,
} from "./store-lists";
import { adminConsoleUsersHandler, AdminConsoleUsersSchema } from "./user-lists";

// verifyUserRole("admin") rejects non-admin JWT claims at the route level;
// the handlers still re-read the role from the DB (requireAdmin) so a
// demotion applies before the stale token expires.
export async function AdminConsoleRoutes(app: FastifyTypedInstance) {
  const preHandler = [verifyJwt, verifyUserRole("admin")];

  app.get(
    "/api/admin-console",
    { schema: AdminConsoleSnapshotSchema.schema, preHandler },
    adminConsoleSnapshotHandler,
  );
  app.get(
    "/api/admin-console/stores/:storeId",
    { schema: AdminConsoleStoreDetailSchema.schema, preHandler },
    adminConsoleStoreDetailHandler,
  );
  app.get(
    "/api/admin-console/stores/:storeId/events",
    { schema: AdminConsoleStoreEventsSchema.schema, preHandler },
    adminConsoleStoreEventsHandler,
  );
  app.get(
    "/api/admin-console/stores/:storeId/products",
    { schema: AdminConsoleStoreProductsSchema.schema, preHandler },
    adminConsoleStoreProductsHandler,
  );
  app.get(
    "/api/admin-console/stores/:storeId/videos",
    { schema: AdminConsoleStoreVideosSchema.schema, preHandler },
    adminConsoleStoreVideosHandler,
  );
  app.get(
    "/api/admin-console/stores/:storeId/comments",
    { schema: AdminConsoleStoreCommentsSchema.schema, preHandler },
    adminConsoleStoreCommentsHandler,
  );
  app.get(
    "/api/admin-console/users",
    { schema: AdminConsoleUsersSchema.schema, preHandler },
    adminConsoleUsersHandler,
  );
  app.get(
    "/api/admin-console/bunny/videos",
    { schema: AdminConsoleBunnyVideosSchema.schema, preHandler },
    adminConsoleBunnyVideosHandler,
  );
  app.get(
    "/api/admin-console/bunny/summary",
    { schema: AdminConsoleBunnySummarySchema.schema, preHandler },
    adminConsoleBunnySummaryHandler,
  );
  app.get(
    "/api/admin-console/bunny/stores",
    { schema: AdminConsoleBunnyStoresSchema.schema, preHandler },
    adminConsoleBunnyStoresHandler,
  );
  app.delete(
    "/api/admin-console/bunny/videos/:guid",
    { schema: AdminConsoleBunnyDeleteVideoSchema.schema, preHandler },
    adminConsoleBunnyDeleteVideoHandler,
  );
  app.post(
    "/api/admin-console",
    { schema: AdminConsoleActionSchema.schema, preHandler },
    adminConsoleActionHandler,
  );
}
