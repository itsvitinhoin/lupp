import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { createVideo } from "../../../test/utils/create-video";

describe("PATCH /api/videos/:videoId (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("updates columns and replaces product links", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const productA = await prisma.product.create({ data: { store_id: store.id, name: "A" } });
    const productB = await prisma.product.create({ data: { store_id: store.id, name: "B" } });
    const video = await createVideo({ storeId: store.id, productIds: [productA.id] });

    const response = await request(app.server)
      .patch(`/api/videos/${video.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Editado", is_featured: true, product_ids: [productB.id] });

    expect(response.status).toBe(200);
    expect(response.body.video).toMatchObject({ title: "Editado", is_featured: true });
    expect(response.body.video.video_products).toHaveLength(1);
    expect(response.body.video.video_products[0].products.id).toBe(productB.id);
    expect(response.body.video.video_products[0].is_primary).toBe(true);
  });

  it("keeps links untouched when product_ids is absent", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const product = await prisma.product.create({ data: { store_id: store.id, name: "Fica" } });
    const video = await createVideo({ storeId: store.id, productIds: [product.id] });

    const response = await request(app.server)
      .patch(`/api/videos/${video.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "archived" });

    expect(response.status).toBe(200);
    expect(response.body.video.status).toBe("archived");
    expect(response.body.video.video_products).toHaveLength(1);
  });

  it("returns 404 for an unknown video", async () => {
    const { owner } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .patch("/api/videos/00000000-0000-7000-8000-000000000000")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Nada" });

    expect(response.status).toBe(404);
  });
});
