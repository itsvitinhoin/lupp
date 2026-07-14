import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { createVideo } from "../../../test/utils/create-video";

describe("POST /api/widget/likes (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates a like and ignores duplicates for the same visitor", async () => {
    const { store } = await createStore();
    const video = await createVideo({ storeId: store.id });
    const payload = {
      store_id: store.id,
      video_id: video.id,
      visitor_id: "visitor-abc-123",
    };

    const first = await request(app.server).post("/api/widget/likes").send(payload);
    const second = await request(app.server).post("/api/widget/likes").send(payload);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await prisma.videoLike.count({ where: { video_id: video.id } })).toBe(1);
  });

  it("requires a visitor_id", async () => {
    const { store } = await createStore();
    const video = await createVideo({ storeId: store.id });

    const response = await request(app.server)
      .post("/api/widget/likes")
      .send({ store_id: store.id, video_id: video.id });

    expect(response.status).toBe(400);
  });

  it("returns 404 when the video is not on the store", async () => {
    const { store } = await createStore();
    const { store: otherStore } = await createStore();
    const video = await createVideo({ storeId: otherStore.id });

    const response = await request(app.server)
      .post("/api/widget/likes")
      .send({ store_id: store.id, video_id: video.id, visitor_id: "visitor-abc-123" });

    expect(response.status).toBe(404);
  });
});
