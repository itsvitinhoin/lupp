import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { findStoreMembership } from "@/lib/store-membership";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { StoreRowSchema } from "@/schemas/rows";
import { Prisma } from "../../../generated/prisma/client";

const ParamsSchema = z.object({ storeId: z.string().min(1) });

// Whitelist: identity/appearance fields only. plan/trial/owner mutations go
// through billing and the master console.
const BodySchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  url: z.string().nullish(),
  platform: z.string().nullish(),
  segment: z.string().nullish(),
  logo_url: z.string().nullish(),
  primary_color: z.string().optional(),
  secondary_color: z.string().optional(),
  button_color: z.string().optional(),
});

export const UpdateStoreSchema = {
  schema: {
    summary: "Update store",
    description:
      "Partial update of store identity/appearance. A slug conflict retries " +
      "once with a store-suffixed slug (mirrors the SPA fallback), then 409 " +
      "slug_conflict.",
    tags: ["stores"],
    operationId: "updateStore",
    security: [{ bearerAuth: [] }],
    params: ParamsSchema,
    body: BodySchema,
    response: {
      200: z.object({ store: StoreRowSchema }),
      ...edgeErrorSchemas,
    },
  },
};

function isSlugConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function updateStoreHandler(request: FastifyRequest, reply: FastifyReply) {
  const { storeId } = ParamsSchema.parse(request.params);
  const body = BodySchema.parse(request.body ?? {});

  const member = await findStoreMembership(request.user.sub, storeId);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  try {
    const store = await prisma.store.update({ where: { id: storeId }, data: body });
    return reply.status(200).send({ store });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return reply.status(404).send({ error: "store_not_found" });
    }
    if (!isSlugConflict(error) || !body.slug) throw error;
  }

  try {
    const store = await prisma.store.update({
      where: { id: storeId },
      data: { ...body, slug: `${body.slug}-${storeId.slice(0, 6)}` },
    });
    return reply.status(200).send({ store });
  } catch (error) {
    if (isSlugConflict(error)) return reply.status(409).send({ error: "slug_conflict" });
    throw error;
  }
}
