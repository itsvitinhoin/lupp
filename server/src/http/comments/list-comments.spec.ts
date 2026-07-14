import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";
import { createVideo } from "../../../test/utils/create-video";

describe("GET /api/comments (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("lists comments with the Supabase join shape, excluding deleted", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const product = await prisma.product.create({
      data: { store_id: store.id, name: "Produto do Vídeo" },
    });
    const video = await createVideo({
      storeId: store.id,
      title: "Vídeo Comentado",
      productIds: [product.id],
    });
    await prisma.comment.createMany({
      data: [
        { store_id: store.id, video_id: video.id, body: "Pendente", status: "pending" },
        { store_id: store.id, video_id: video.id, body: "Sumido", status: "deleted" },
      ],
    });

    const response = await request(app.server)
      .get("/api/comments")
      .query({ store_id: store.id })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.comments).toHaveLength(1);
    const [comment] = response.body.comments;
    expect(comment.body).toBe("Pendente");
    expect(comment.videos.title).toBe("Vídeo Comentado");
    expect(comment.videos.video_products[0].products.name).toBe("Produto do Vídeo");
  });

  it("filters by status", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const video = await createVideo({ storeId: store.id });
    await prisma.comment.createMany({
      data: [
        { store_id: store.id, video_id: video.id, body: "Aprovado", status: "approved" },
        { store_id: store.id, video_id: video.id, body: "Pendente", status: "pending" },
      ],
    });

    const response = await request(app.server)
      .get("/api/comments")
      .query({ store_id: store.id, status: "approved" })
      .set("Authorization", `Bearer ${token}`);

    expect(response.body.comments.map((c: any) => c.body)).toEqual(["Aprovado"]);
  });

  it("rejects non-members with 403", async () => {
    const { store } = await createStore();
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });

    const response = await request(app.server)
      .get("/api/comments")
      .query({ store_id: store.id })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });
});
