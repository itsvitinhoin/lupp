import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { serializeCoupon } from "@/lib/serialize";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { CouponRowSchema } from "@/schemas/rows";

const ParamsSchema = z.object({ code: z.string().min(1) });

export const GetCouponSchema = {
  schema: {
    summary: "Validate coupon code",
    description:
      "Case-insensitive lookup of an active coupon. Returns null (not 404) " +
      "for misses; the client keeps its window/redemption checks.",
    tags: ["billing"],
    operationId: "getCoupon",
    security: [{ bearerAuth: [] }],
    params: ParamsSchema,
    response: {
      200: z.object({ coupon: CouponRowSchema.nullable() }),
      ...edgeErrorSchemas,
    },
  },
};

export async function getCouponHandler(request: FastifyRequest, reply: FastifyReply) {
  const { code } = ParamsSchema.parse(request.params);

  const coupon = await prisma.discountCoupon.findFirst({
    where: { code: { equals: code.trim(), mode: "insensitive" }, is_active: true },
  });

  return reply.status(200).send({ coupon: coupon ? serializeCoupon(coupon) : null });
}
