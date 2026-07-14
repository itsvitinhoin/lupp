import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { env } from "@/env";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { createVideo } from "../../../test/utils/create-video";

describe("public comments (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("lists only approved comments with the public projection", async () => {
    const { store } = await createStore();
    const video = await createVideo({ storeId: store.id });
    await prisma.comment.createMany({
      data: [
        {
          store_id: store.id,
          video_id: video.id,
          author_name: "Ana",
          author_email: "ana@example.com",
          body: "Aprovado",
          status: "approved",
        },
        { store_id: store.id, video_id: video.id, body: "Pendente", status: "pending" },
      ],
    });

    const response = await request(app.server)
      .get("/api/comments/public")
      .query({ video_id: video.id });

    expect(response.status).toBe(200);
    expect(response.body.comments).toHaveLength(1);
    expect(response.body.comments[0]).toMatchObject({ author_name: "Ana", body: "Aprovado" });
    // Emails never leave the server on the public surface.
    expect(response.body.comments[0].author_email).toBeUndefined();
  });

  it("creates a pending comment when the video allows comments", async () => {
    const { store } = await createStore();
    const video = await prisma.video.create({
      data: { store_id: store.id, title: "Comentável", status: "active", allow_comments: true },
    });

    const response = await request(app.server).post("/api/comments/public").send({
      store_id: store.id,
      video_id: video.id,
      author_name: "Bruno",
      body: "Muito bom!",
    });

    expect(response.status).toBe(201);
    const row = await prisma.comment.findFirstOrThrow({ where: { video_id: video.id } });
    expect(row.status).toBe("pending");
    expect(row.author_name).toBe("Bruno");
  });

  it("rejects comments on videos that do not allow them", async () => {
    const { store } = await createStore();
    const video = await createVideo({ storeId: store.id }); // allow_comments default false

    const response = await request(app.server).post("/api/comments/public").send({
      store_id: store.id,
      video_id: video.id,
      author_name: "Caio",
      body: "Bloqueado",
    });

    expect(response.status).toBe(404);
    expect(await prisma.comment.count({ where: { video_id: video.id } })).toBe(0);
  });

  it("throttles the public write past the limit with 429", async () => {
    const { store } = await createStore();
    const video = await prisma.video.create({
      data: { store_id: store.id, title: "Alvo", status: "active", allow_comments: true },
    });
    const FORGED_IP = "203.0.113.9";
    let throttled: request.Response | undefined;

    for (let i = 0; i < env.RATE_LIMIT_PUBLIC_WRITE_MAX + 2; i++) {
      const response = await request(app.server)
        .post("/api/comments/public")
        .set("x-forwarded-for", FORGED_IP)
        .send({ store_id: store.id, video_id: video.id, author_name: "Bot", body: `spam ${i}` });
      if (response.status === 429) {
        throttled = response;
        break;
      }
    }

    expect(throttled?.status).toBe(429);
  });
});
