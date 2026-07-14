import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createUser } from "../../../test/utils/create-user";
import { createPlans } from "../../../test/utils/create-plans";

describe("POST /api/stores (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
    // The trialing subscription FKs plans.id.
    await createPlans();
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates the store with the full onboarding cascade", async () => {
    const user = await createUser();
    const token = app.jwt.sign({ sub: user.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/stores")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Loja Nova", slug: "loja-nova", url: "https://loja.example.com" });

    expect(response.status).toBe(201);
    const storeId = response.body.store.id;
    expect(response.body.store).toMatchObject({
      name: "Loja Nova",
      slug: "loja-nova",
      owner_id: user.id,
      plan_id: "start",
    });
    expect(response.body.store.trial_ends_at).not.toBeNull();

    const member = await prisma.storeMember.findUniqueOrThrow({
      where: { store_id_user_id: { store_id: storeId, user_id: user.id } },
    });
    expect(member.role).toBe("owner");

    const subscription = await prisma.subscription.findFirstOrThrow({
      where: { store_id: storeId },
    });
    expect(subscription.status).toBe("trialing");

    const widgets = await prisma.widget.findMany({ where: { store_id: storeId } });
    expect(widgets).toHaveLength(4);
    const floating = widgets.find((w) => w.type === "floating_video");
    expect(floating?.status).toBe("active");
    expect((floating?.settings as any).display.mode).toBe("all");
    expect((floating?.settings as any).carousel.enabled).toBe(true);
    expect(widgets.filter((w) => w.type !== "floating_video").every((w) => w.status === "inactive")).toBe(true);

    await prisma.customPage.findFirstOrThrow({
      where: { store_id: storeId, slug: "videos", name: "Feed Principal" },
    });
    await prisma.feedSetting.findUniqueOrThrow({ where: { store_id: storeId } });
  });

  it("retries a taken slug with a user suffix", async () => {
    const user = await createUser();
    const token = app.jwt.sign({ sub: user.id, role: "agent" });

    const first = await request(app.server)
      .post("/api/stores")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Repetida", slug: "repetida" });
    expect(first.status).toBe(201);

    const second = await request(app.server)
      .post("/api/stores")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Repetida", slug: "repetida" });

    expect(second.status).toBe(201);
    expect(second.body.store.slug).toBe(`repetida-${user.id.slice(0, 6)}`);
  });

  it("returns 409 slug_conflict when the retry also collides", async () => {
    const user = await createUser();
    const token = app.jwt.sign({ sub: user.id, role: "agent" });

    for (let i = 0; i < 2; i++) {
      await request(app.server)
        .post("/api/stores")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Cheia", slug: "cheia" });
    }

    const third = await request(app.server)
      .post("/api/stores")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Cheia", slug: "cheia" });

    expect(third.status).toBe(409);
    expect(third.body).toEqual({ error: "slug_conflict" });
    // The failed transaction must not leave partial rows behind.
    expect(await prisma.store.count({ where: { slug: { startsWith: "cheia" } } })).toBe(2);
  });
});
