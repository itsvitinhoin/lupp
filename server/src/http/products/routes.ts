import { FastifyTypedInstance } from "@/@types/fastify-type-instance";
import { verifyJwt } from "@/middlewares/verify-jwt";
import { listProductsHandler, ListProductsSchema } from "./list-products";
import { createProductHandler, CreateProductSchema } from "./create-product";
import { updateProductHandler, UpdateProductSchema } from "./update-product";
import { deleteProductHandler, DeleteProductSchema } from "./delete-product";

export async function ProductRoutes(app: FastifyTypedInstance) {
  app.get(
    "/api/products",
    { schema: ListProductsSchema.schema, preHandler: [verifyJwt] },
    listProductsHandler,
  );
  app.post(
    "/api/products",
    { schema: CreateProductSchema.schema, preHandler: [verifyJwt] },
    createProductHandler,
  );
  app.patch(
    "/api/products/:productId",
    { schema: UpdateProductSchema.schema, preHandler: [verifyJwt] },
    updateProductHandler,
  );
  app.delete(
    "/api/products/:productId",
    { schema: DeleteProductSchema.schema, preHandler: [verifyJwt] },
    deleteProductHandler,
  );
}
