import { FastifyTypedInstance } from "@/@types/fastify-type-instance";
import { verifyJwt } from "@/middlewares/verify-jwt";
import { listStoresHandler, ListStoresSchema } from "./list-stores";
import { getStoreHandler, GetStoreSchema } from "./get-store";
import { createStoreHandler, CreateStoreSchema } from "./create-store";
import { updateStoreHandler, UpdateStoreSchema } from "./update-store";
import { uploadLogoHandler, UploadLogoSchema } from "./upload-logo";

const LOGO_BODY_LIMIT = 10 * 1024 * 1024;

export async function StoreRoutes(app: FastifyTypedInstance) {
  // The logo endpoint takes raw image bytes; parser scoped to this plugin.
  app.addContentTypeParser<Buffer>(
    /^image\//,
    { bodyLimit: LOGO_BODY_LIMIT, parseAs: "buffer" },
    (_request, body, done) => done(null, body),
  );

  app.get(
    "/api/stores",
    { schema: ListStoresSchema.schema, preHandler: [verifyJwt] },
    listStoresHandler,
  );
  app.post(
    "/api/stores",
    { schema: CreateStoreSchema.schema, preHandler: [verifyJwt] },
    createStoreHandler,
  );
  app.get(
    "/api/stores/:storeId",
    { schema: GetStoreSchema.schema, preHandler: [verifyJwt] },
    getStoreHandler,
  );
  app.patch(
    "/api/stores/:storeId",
    { schema: UpdateStoreSchema.schema, preHandler: [verifyJwt] },
    updateStoreHandler,
  );
  app.post(
    "/api/stores/:storeId/logo",
    {
      schema: UploadLogoSchema.schema,
      preHandler: [verifyJwt],
      bodyLimit: LOGO_BODY_LIMIT,
    },
    uploadLogoHandler,
  );
}
