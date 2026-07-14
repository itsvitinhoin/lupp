import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";

describe("POST /api/videos (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates the row and product links, first id primary", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const productA = await prisma.product.create({ data: { store_id: store.id, name: "A" } });
    const productB = await prisma.product.create({ data: { store_id: store.id, name: "B" } });

    const response = await request(app.server)
      .post("/api/videos")
      .set("Authorization", `Bearer ${token}`)
      .send({
        store_id: store.id,
        title: "Novo Vídeo",
        provider: "bunny",
        status: "active",
        product_ids: [productA.id, productB.id],
      });

    expect(response.status).toBe(201);
    expect(response.body.video.title).toBe("Novo Vídeo");
    const links = response.body.video.video_products;
    expect(links).toHaveLength(2);
    expect(links.find((l: any) => l.products.id === productA.id).is_primary).toBe(true);
    expect(links.find((l: any) => l.products.id === productB.id).is_primary).toBe(false);
  });

  it("rejects product ids from another store without creating the row", async () => {
    const { owner, store } = await createStore();
    const { store: otherStore } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const foreign = await prisma.product.create({
      data: { store_id: otherStore.id, name: "Alheio" },
    });

    const response = await request(app.server)
      .post("/api/videos")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, title: "Inválido", product_ids: [foreign.id] });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "invalid_product_ids" });
    expect(await prisma.video.count({ where: { store_id: store.id } })).toBe(0);
  });
});
