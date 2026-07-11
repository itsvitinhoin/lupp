import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma";
import { createUser } from "./create-user";

/**
 * Builds the ownership chain every store-scoped route expects: a user, their
 * store, and the store_members row the membership check looks up. Optionally
 * adds a trialing subscription (7-day period) like shopify-oauth-callback's
 * embedded bootstrap provisions.
 */
export async function createStore(
  overrides: {
    ownerId?: string;
    name?: string;
    slug?: string;
    plan_id?: string;
    status?: "active" | "paused" | "disabled";
    trial_ends_at?: Date | null;
    withTrialSubscription?: boolean;
  } = {},
) {
  const owner = overrides.ownerId
    ? await prisma.user.findUniqueOrThrow({ where: { id: overrides.ownerId } })
    : await createUser();

  const store = await prisma.store.create({
    data: {
      owner_id: owner.id,
      name: overrides.name ?? "Test Store",
      slug: overrides.slug ?? `test-store-${randomUUID()}`,
      plan_id: overrides.plan_id ?? "start",
      status: overrides.status ?? "active",
      trial_started_at: new Date(),
      trial_ends_at:
        overrides.trial_ends_at === undefined
          ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          : overrides.trial_ends_at,
    },
  });

  const membership = await prisma.storeMember.create({
    data: { store_id: store.id, user_id: owner.id, role: "owner" },
  });

  const subscription = overrides.withTrialSubscription
    ? await prisma.subscription.create({
        data: {
          store_id: store.id,
          plan_id: overrides.plan_id ?? "start",
          status: "trialing",
          current_period_start: new Date(),
          current_period_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      })
    : null;

  return { owner, store, membership, subscription };
}
