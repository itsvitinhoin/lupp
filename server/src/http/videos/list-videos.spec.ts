import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";
import { createVideo } from "../../../test/utils/create-video";

describe("GET /api/videos (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects non-members with 403", async () => {
    const { store } = await createStore();
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });

    const response = await request(app.server)
      .get("/api/videos")
      .query({ store_id: store.id })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("lists videos with the PostgREST nesting, excluding deleted", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const product = await prisma.product.create({
      data: { store_id: store.id, name: "Produto Linkado", price: 79.9 },
    });
    await prisma.productVariant.create({
      data: {
        store_id: store.id,
        product_id: product.id,
        platform: "upzero",
        external_id: "v1",
        price: 89.9,
      },
    });
    await createVideo({ storeId: store.id, title: "Com Produto", productIds: [product.id] });
    await createVideo({ storeId: store.id, title: "Apagado", status: "deleted" });

    const response = await request(app.server)
      .get("/api/videos")
      .query({ store_id: store.id })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.videos).toHaveLength(1);
    const [video] = response.body.videos;
    expect(video.title).toBe("Com Produto");
    expect(video.video_products[0].is_primary).toBe(true);
    expect(video.video_products[0].products.name).toBe("Produto Linkado");
    expect(video.video_products[0].products.price).toBe(79.9);
    expect(video.video_products[0].products.product_variants[0].price).toBe(89.9);
  });

  it("applies search and status filters", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    await createVideo({ storeId: store.id, title: "Tutorial Maquiagem" });
    await createVideo({ storeId: store.id, title: "Unboxing", status: "paused" });

    const searched = await request(app.server)
      .get("/api/videos")
      .query({ store_id: store.id, search: "maquiagem" })
      .set("Authorization", `Bearer ${token}`);
    expect(searched.body.videos.map((v: any) => v.title)).toEqual(["Tutorial Maquiagem"]);

    const paused = await request(app.server)
      .get("/api/videos")
      .query({ store_id: store.id, status: "paused" })
      .set("Authorization", `Bearer ${token}`);
    expect(paused.body.videos.map((v: any) => v.title)).toEqual(["Unboxing"]);
  });
});
