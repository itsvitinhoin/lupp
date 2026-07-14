import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WIDGETS, withDefaultFloatingWidgetSettings } from "@/lib/widget-defaults";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { StoreRowSchema } from "@/schemas/rows";
import { Prisma, WidgetType } from "../../../generated/prisma/client";

const TRIAL_DAYS = 7;

const BodySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).describe("Client-computed slug; deduped server-side on conflict."),
  url: z.string().nullish(),
  platform: z.string().nullish(),
  segment: z.string().nullish(),
});

export const CreateStoreSchema = {
  schema: {
    summary: "Create store with defaults",
    description:
      "Creates a store (7-day trial on the start plan) plus its onboarding " +
      "cascade in one transaction: owner membership, trialing subscription, " +
      "default widgets, the Feed Principal custom page and feed settings. " +
      "The owner is the authenticated user. A slug conflict retries once " +
      "with a user-suffixed slug, then returns 409 slug_conflict.",
    tags: ["stores"],
    operationId: "createStore",
    security: [{ bearerAuth: [] }],
    body: BodySchema,
    response: {
      201: z.object({ store: StoreRowSchema }),
      ...edgeErrorSchemas,
    },
  },
};

function isSlugConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function createStoreCascade(
  ownerId: string,
  body: z.infer<typeof BodySchema>,
  slug: string,
) {
  const trialStartedAt = new Date();
  const trialEndsAt = new Date(trialStartedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const store = await tx.store.create({
      data: {
        owner_id: ownerId,
        name: body.name,
        slug,
        url: body.url ?? null,
        platform: body.platform ?? null,
        segment: body.segment ?? null,
        plan_id: "start",
        trial_started_at: trialStartedAt,
        trial_ends_at: trialEndsAt,
      },
    });

    await tx.storeMember.create({
      data: { store_id: store.id, user_id: ownerId, role: "owner" },
    });

    await tx.subscription.create({
      data: {
        store_id: store.id,
        plan_id: "start",
        status: "trialing",
        current_period_start: trialStartedAt,
        current_period_end: trialEndsAt,
      },
    });

    await tx.widget.createMany({
      data: DEFAULT_WIDGETS.map((widget) => ({
        store_id: store.id,
        name: widget.name,
        type: widget.type as WidgetType,
        target: widget.target,
        status: widget.type === "floating_video" ? ("active" as const) : ("inactive" as const),
        settings:
          widget.type === "floating_video" ? withDefaultFloatingWidgetSettings() : {},
      })),
    });

    await tx.customPage.create({
      data: { store_id: store.id, name: "Feed Principal", slug: "videos", status: "draft" },
    });

    await tx.feedSetting.create({ data: { store_id: store.id, slug: "videos" } });

    return store;
  });
}

export async function createStoreHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = BodySchema.parse(request.body);
  const ownerId = request.user.sub;

  try {
    const store = await createStoreCascade(ownerId, body, body.slug);
    return reply.status(201).send({ store });
  } catch (error) {
    if (!isSlugConflict(error)) throw error;
  }

  try {
    const store = await createStoreCascade(ownerId, body, `${body.slug}-${ownerId.slice(0, 6)}`);
    return reply.status(201).send({ store });
  } catch (error) {
    if (isSlugConflict(error)) return reply.status(409).send({ error: "slug_conflict" });
    throw error;
  }
}
