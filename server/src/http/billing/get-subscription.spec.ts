import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createPlans } from "../../../test/utils/create-plans";
import { createStore } from "../../../test/utils/create-store";

describe("GET /api/billing/subscription (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
    await createPlans();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the latest subscription with decimals as numbers", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    await prisma.subscription.create({
      data: { store_id: store.id, plan_id: "start", status: "canceled" },
    });
    const latest = await prisma.subscription.create({
      data: {
        store_id: store.id,
        plan_id: "growth",
        status: "active",
        discount_percent: 10,
      },
    });

    const response = await request(app.server)
      .get("/api/billing/subscription")
      .query({ store_id: store.id })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.subscription).toMatchObject({
      id: latest.id,
      status: "active",
      discount_percent: 10,
    });
  });

  it("returns null when the store has no subscription", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .get("/api/billing/subscription")
      .query({ store_id: store.id })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.subscription).toBeNull();
  });
});
