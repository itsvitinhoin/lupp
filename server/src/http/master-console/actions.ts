import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { Prisma } from "../../../generated/prisma/client";
import { clean, MasterAdmin, requireMasterAdmin } from "./master-admin";
import {
  getMasterConsoleSnapshot,
  MasterConsoleSnapshotResponseSchema,
} from "./snapshot";

// Ported from supabase/functions/master-console (POST). action defaults to
// "snapshot"; the body stays loose because the whole payload is persisted
// verbatim into master_console_audit_logs.
const BodySchema = z
  .object({
    action: z
      .string()
      .optional()
      .describe("snapshot (default) | pause_store | activate_store | extend_trial | set_plan."),
    store_id: z.string().optional().describe("Target store (required for every action)."),
    plan_id: z.string().optional().describe("set_plan: target plan id."),
    days: z
      .union([z.number(), z.string()])
      .optional()
      .describe("extend_trial: days to add (1-90, default 7)."),
    current_trial_ends_at: z
      .string()
      .optional()
      .describe("extend_trial: extend from this date when it is still in the future."),
  })
  .loose();

export const MasterConsoleActionSchema = {
  schema: {
    summary: "Master console action",
    description:
      "Runs a master-console action (pause_store, activate_store, extend_trial, set_plan) " +
      "and writes a master_console_audit_logs row, or returns the snapshot when action is " +
      "omitted/'snapshot'. Caller's email must be in the MASTER_ADMIN_EMAILS allowlist.",
    tags: ["master-console"],
    operationId: "postMasterConsole",
    security: [{ bearerAuth: [] }],
    body: BodySchema,
    response: {
      200: z.union([
        MasterConsoleSnapshotResponseSchema,
        z.object({ ok: z.boolean(), result: z.any() }),
      ]),
      ...edgeErrorSchemas,
    },
  },
};

type ActionBody = z.infer<typeof BodySchema>;

async function runAction(
  action: string,
  admin: MasterAdmin,
  body: ActionBody,
  reply: FastifyReply,
) {
  const storeId = clean(body.store_id);
  if (!storeId) return reply.status(400).send({ error: "missing_store_id" });

  let result: Record<string, unknown> = {};

  if (action === "pause_store" || action === "activate_store") {
    const nextStatus = action === "pause_store" ? ("paused" as const) : ("active" as const);
    const { count } = await prisma.store.updateMany({
      where: { id: storeId },
      data: { status: nextStatus },
    });
    // The original's update().maybeSingle() yielded null (not an error) for a
    // missing store; updateMany + count reproduces that.
    result = { store: count ? { id: storeId, status: nextStatus } : null };
  } else if (action === "extend_trial") {
    const days = Math.max(1, Math.min(Number(body.days) || 7, 90));
    const currentTrialEnd = clean(body.current_trial_ends_at);
    const base =
      currentTrialEnd && new Date(currentTrialEnd).getTime() > Date.now()
        ? new Date(currentTrialEnd)
        : new Date();
    base.setDate(base.getDate() + days);
    const trialEndsAt = base;

    const { count } = await prisma.store.updateMany({
      where: { id: storeId },
      data: { trial_ends_at: trialEndsAt },
    });

    await prisma.subscription.updateMany({
      where: { store_id: storeId, status: "trialing" },
      data: { current_period_end: trialEndsAt, status: "trialing" },
    });

    result = {
      store: count ? { id: storeId, trial_ends_at: trialEndsAt.toISOString() } : null,
    };
  } else if (action === "set_plan") {
    const planId = clean(body.plan_id);
    if (!planId) return reply.status(400).send({ error: "missing_plan_id" });

    const plan = await prisma.plan.findUnique({ where: { id: planId }, select: { id: true } });
    if (!plan) return reply.status(404).send({ error: "plan_not_found" });

    const { count } = await prisma.store.updateMany({
      where: { id: storeId },
      data: { plan_id: planId },
    });

    const latestSubscription = await prisma.subscription.findFirst({
      where: { store_id: storeId },
      orderBy: { created_at: "desc" },
      select: { id: true },
    });
    if (latestSubscription) {
      await prisma.subscription.update({
        where: { id: latestSubscription.id },
        data: { plan_id: planId },
      });
    }

    result = {
      store: count ? { id: storeId, plan_id: planId } : null,
      subscription_id: latestSubscription?.id || null,
    };
  } else {
    return reply.status(400).send({ error: "unknown_action" });
  }

  await prisma.masterConsoleAuditLog.create({
    data: {
      action,
      admin_email: admin.email,
      admin_user_id: admin.id,
      payload: body as Prisma.InputJsonObject,
      result: result as Prisma.InputJsonObject,
      target_store_id: storeId,
    },
  });

  return reply.status(200).send({ ok: true, result });
}

export async function masterConsoleActionHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = BodySchema.parse(request.body ?? {});

  const gate = await requireMasterAdmin(request.user.sub);
  if ("error" in gate) return reply.status(gate.status).send({ error: gate.error });

  const action = clean(body.action) || "snapshot";

  try {
    if (action === "snapshot") {
      return reply.status(200).send(await getMasterConsoleSnapshot());
    }
    return await runAction(action, gate.admin, body, reply);
  } catch (error) {
    return reply
      .status(500)
      .send({ error: error instanceof Error ? error.message : "master_console_failed" });
  }
}
