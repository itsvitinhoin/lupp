import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { mergeWidgetSettings } from "@workspace/widget-config";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { issueAuthToken } from "@/lib/auth-tokens";
import { sendPasswordReset } from "@/lib/mailer";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { Prisma } from "../../../generated/prisma/client";
import { asRecord } from "@/lib/text";
import { clean, AdminUser, requireAdmin } from "./admin-gate";
import {
  getAdminConsoleSnapshot,
  AdminConsoleSnapshotResponseSchema,
} from "./snapshot";

// Ported from supabase/functions/admin-console (POST). action defaults to
// "snapshot"; the body stays loose because the whole payload is persisted
// verbatim into admin_console_audit_logs.
const BodySchema = z
  .object({
    action: z
      .string()
      .optional()
      .describe(
        "snapshot (default) | pause_store | activate_store | extend_trial | set_plan | " +
          "update_store | update_widget | update_feed | add_member | set_member_role | " +
          "remove_member | confirm_user_email | send_password_reset.",
      ),
    store_id: z.string().optional().describe("Target store (required for every action)."),
    plan_id: z.string().optional().describe("set_plan: target plan id."),
    widget_id: z.string().optional().describe("update_widget: target widget id."),
    member_id: z
      .string()
      .optional()
      .describe("set_member_role / remove_member: target store_members id."),
    user_id: z
      .string()
      .optional()
      .describe("confirm_user_email / send_password_reset: target user id (must belong to the store)."),
    email: z.string().optional().describe("add_member: account email to add to the store."),
    role: z.string().optional().describe("add_member / set_member_role: member role."),
    days: z
      .union([z.number(), z.string()])
      .optional()
      .describe("extend_trial: days to add (1-90, default 7)."),
    current_trial_ends_at: z
      .string()
      .optional()
      .describe("extend_trial: extend from this date when it is still in the future."),
    patch: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        "update_store: name, url, platform, segment, logo_url, primary_color, " +
          "secondary_color, button_color, status. update_widget: name, status, target, " +
          "settings (merged section-wise). update_feed: is_active, slug, settings " +
          "(shallow-merged).",
      ),
  })
  .loose();

// update_store only touches presentation/operational columns — plan changes go
// through set_plan and trial changes through extend_trial so each keeps its own
// audit action.
const STORE_PATCH_NULLABLE = ["url", "platform", "segment", "logo_url"] as const;
const STORE_PATCH_REQUIRED = [
  "name",
  "primary_color",
  "secondary_color",
  "button_color",
] as const;
const STORE_STATUSES = ["active", "paused", "disabled"] as const;

function buildStorePatch(patch: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const field of STORE_PATCH_NULLABLE) {
    if (!(field in patch)) continue;
    const value = clean(patch[field]);
    data[field] = value || null;
  }
  for (const field of STORE_PATCH_REQUIRED) {
    if (!(field in patch)) continue;
    const value = clean(patch[field]);
    if (value) data[field] = value;
  }
  if ("status" in patch) {
    const status = clean(patch.status);
    if (!STORE_STATUSES.includes(status as (typeof STORE_STATUSES)[number])) {
      return { error: "invalid_status" as const };
    }
    data.status = status;
  }
  return { data };
}

const MEMBER_ROLES = ["owner", "admin", "marketing", "editor", "analyst"] as const;
type MemberRole = (typeof MEMBER_ROLES)[number];

type ActionOutcome =
  | { result: Record<string, unknown> }
  | { error: string; status: 400 | 404 | 409 };

async function runWidgetUpdate(storeId: string, body: ActionBody): Promise<ActionOutcome> {
  const widgetId = clean(body.widget_id);
  if (!widgetId) return { error: "missing_widget_id", status: 400 };

  const widget = await prisma.widget.findFirst({
    where: { id: widgetId, store_id: storeId },
    select: { id: true, settings: true },
  });
  if (!widget) return { error: "widget_not_found", status: 404 };

  const patch = asRecord(body.patch);
  const data: Prisma.WidgetUpdateInput = {};
  if ("name" in patch) {
    const name = clean(patch.name);
    if (!name) return { error: "invalid_name", status: 400 };
    data.name = name;
  }
  if ("status" in patch) {
    const status = clean(patch.status);
    if (status !== "active" && status !== "inactive") {
      return { error: "invalid_status", status: 400 };
    }
    data.status = status;
  }
  if ("target" in patch) data.target = clean(patch.target) || null;
  if ("settings" in patch) {
    // Same section-wise merge + normalization as PATCH /api/widgets/:id, so
    // admin edits can't bypass the shared settings contract.
    data.settings = mergeWidgetSettings(
      widget.settings,
      asRecord(patch.settings),
    ) as Prisma.InputJsonObject;
  }
  if (!Object.keys(data).length) return { error: "empty_patch", status: 400 };

  const updated = await prisma.widget.update({ where: { id: widget.id }, data });
  return {
    result: {
      widget: {
        id: updated.id,
        name: updated.name,
        settings: updated.settings,
        status: updated.status,
        target: updated.target,
      },
    },
  };
}

async function runFeedUpdate(storeId: string, body: ActionBody): Promise<ActionOutcome> {
  const patch = asRecord(body.patch);
  const changes: { is_active?: boolean; settings?: Prisma.InputJsonObject; slug?: string } = {};
  if ("is_active" in patch) changes.is_active = Boolean(patch.is_active);
  if ("slug" in patch) {
    const slug = clean(patch.slug).toLowerCase();
    if (!slug) return { error: "invalid_slug", status: 400 };
    changes.slug = slug;
  }

  const existing = await prisma.feedSetting.findUnique({ where: { store_id: storeId } });
  if ("settings" in patch) {
    changes.settings = {
      ...asRecord(existing?.settings),
      ...asRecord(patch.settings),
    } as Prisma.InputJsonObject;
  }
  if (!Object.keys(changes).length) return { error: "empty_patch", status: 400 };

  const feed = await prisma.feedSetting.upsert({
    where: { store_id: storeId },
    create: {
      store_id: storeId,
      is_active: changes.is_active ?? true,
      slug: changes.slug ?? "videos",
      settings: changes.settings ?? {},
    },
    update: changes,
  });
  return {
    result: {
      feed_settings: {
        id: feed.id,
        is_active: feed.is_active,
        settings: feed.settings,
        slug: feed.slug,
      },
    },
  };
}

async function runAddMember(storeId: string, body: ActionBody): Promise<ActionOutcome> {
  const email = clean(body.email).toLowerCase();
  if (!email) return { error: "missing_email", status: 400 };
  const role = (clean(body.role) || "admin") as MemberRole;
  if (!MEMBER_ROLES.includes(role)) return { error: "invalid_role", status: 400 };

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true, name: true },
  });
  if (!user) return { error: "user_not_found", status: 404 };

  const existing = await prisma.storeMember.findUnique({
    where: { store_id_user_id: { store_id: storeId, user_id: user.id } },
    select: { id: true },
  });
  if (existing) return { error: "already_member", status: 409 };

  const member = await prisma.storeMember.create({
    data: { store_id: storeId, user_id: user.id, role },
  });
  return {
    result: {
      member: { id: member.id, role: member.role, user_email: user.email, user_id: user.id },
    },
  };
}

async function runSetMemberRole(storeId: string, body: ActionBody): Promise<ActionOutcome> {
  const memberId = clean(body.member_id);
  if (!memberId) return { error: "missing_member_id", status: 400 };
  const role = clean(body.role) as MemberRole;
  if (!MEMBER_ROLES.includes(role)) return { error: "invalid_role", status: 400 };

  const member = await prisma.storeMember.findFirst({
    where: { id: memberId, store_id: storeId },
    select: { id: true },
  });
  if (!member) return { error: "member_not_found", status: 404 };

  const updated = await prisma.storeMember.update({
    where: { id: member.id },
    data: { role },
  });
  return { result: { member: { id: updated.id, role: updated.role, user_id: updated.user_id } } };
}

async function runRemoveMember(storeId: string, body: ActionBody): Promise<ActionOutcome> {
  const memberId = clean(body.member_id);
  if (!memberId) return { error: "missing_member_id", status: 400 };

  const member = await prisma.storeMember.findFirst({
    where: { id: memberId, store_id: storeId },
    select: { id: true, user_id: true, store: { select: { owner_id: true } } },
  });
  if (!member) return { error: "member_not_found", status: 404 };
  if (member.user_id === member.store.owner_id) {
    return { error: "cannot_remove_owner", status: 400 };
  }

  await prisma.storeMember.delete({ where: { id: member.id } });
  return { result: { removed_member_id: member.id, user_id: member.user_id } };
}

/** Owner + members of the store — the only users store-scoped support actions may touch. */
async function findStoreUser(storeId: string, userId: string) {
  if (!userId) return null;
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { owner_id: true, members: { select: { user_id: true }, where: { user_id: userId } } },
  });
  if (!store) return null;
  if (store.owner_id !== userId && store.members.length === 0) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, email_confirmed_at: true },
  });
}

async function runConfirmUserEmail(storeId: string, body: ActionBody): Promise<ActionOutcome> {
  const userId = clean(body.user_id);
  if (!userId) return { error: "missing_user_id", status: 400 };
  const user = await findStoreUser(storeId, userId);
  if (!user) return { error: "user_not_in_store", status: 404 };

  const { count } = await prisma.user.updateMany({
    where: { id: user.id, email_confirmed_at: null },
    data: { email_confirmed_at: new Date() },
  });
  return {
    result: { user: { id: user.id, email: user.email, already_confirmed: count === 0 } },
  };
}

async function runSendPasswordReset(storeId: string, body: ActionBody): Promise<ActionOutcome> {
  const userId = clean(body.user_id);
  if (!userId) return { error: "missing_user_id", status: 400 };
  const user = await findStoreUser(storeId, userId);
  if (!user) return { error: "user_not_in_store", status: 404 };

  const token = await issueAuthToken(user.id, "password_reset");
  await sendPasswordReset({
    to: user.email,
    name: user.name,
    resetUrl: `${env.LUPP_APP_URL}/login?reset=1&token=${token}`,
  });
  return { result: { sent: true, user: { id: user.id, email: user.email } } };
}

export const AdminConsoleActionSchema = {
  schema: {
    summary: "Admin console action",
    description:
      "Runs a admin-console action (pause_store, activate_store, extend_trial, set_plan, " +
      "update_store, update_widget, update_feed, add_member, set_member_role, remove_member, " +
      "confirm_user_email, send_password_reset) " +
      "and writes a admin_console_audit_logs row, or returns the snapshot when action is " +
      "omitted/'snapshot'. Caller's account must hold the admin role.",
    tags: ["admin-console"],
    operationId: "postAdminConsole",
    security: [{ bearerAuth: [] }],
    body: BodySchema,
    response: {
      200: z.union([
        AdminConsoleSnapshotResponseSchema,
        z.object({ ok: z.boolean(), result: z.any() }),
      ]),
      ...edgeErrorSchemas,
    },
  },
};

type ActionBody = z.infer<typeof BodySchema>;

async function runAction(
  action: string,
  admin: AdminUser,
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
  } else if (action === "update_store") {
    const patch = buildStorePatch(asRecord(body.patch));
    if ("error" in patch) return reply.status(400).send({ error: patch.error });
    if (Object.keys(patch.data).length === 0) {
      return reply.status(400).send({ error: "empty_patch" });
    }

    const { count } = await prisma.store.updateMany({
      where: { id: storeId },
      data: patch.data as Prisma.StoreUpdateManyMutationInput,
    });
    result = { store: count ? { id: storeId, ...patch.data } : null };
  } else {
    const scopedActions: Record<
      string,
      (storeId: string, body: ActionBody) => Promise<ActionOutcome>
    > = {
      add_member: runAddMember,
      confirm_user_email: runConfirmUserEmail,
      remove_member: runRemoveMember,
      send_password_reset: runSendPasswordReset,
      set_member_role: runSetMemberRole,
      update_feed: runFeedUpdate,
      update_widget: runWidgetUpdate,
    };
    const scopedAction = scopedActions[action];
    if (!scopedAction) return reply.status(400).send({ error: "unknown_action" });

    const outcome = await scopedAction(storeId, body);
    if ("error" in outcome) {
      return reply.status(outcome.status).send({ error: outcome.error });
    }
    result = outcome.result;
  }

  await prisma.adminConsoleAuditLog.create({
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

export async function adminConsoleActionHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = BodySchema.parse(request.body ?? {});

  const gate = await requireAdmin(request.user.sub);
  if ("error" in gate) return reply.status(gate.status).send({ error: gate.error });

  const action = clean(body.action) || "snapshot";

  try {
    if (action === "snapshot") {
      return reply.status(200).send(await getAdminConsoleSnapshot());
    }
    return await runAction(action, gate.admin, body, reply);
  } catch (error) {
    return reply
      .status(500)
      .send({ error: error instanceof Error ? error.message : "admin_console_failed" });
  }
}
