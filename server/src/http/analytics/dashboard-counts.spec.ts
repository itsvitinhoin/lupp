import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { createVideo } from "../../../test/utils/create-video";

describe("GET /api/analytics/dashboard-counts (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("counts active videos, likes and pending comments", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const video = await createVideo({ storeId: store.id });
    await createVideo({ storeId: store.id, status: "paused" });
    await prisma.videoLike.createMany({
      data: [
        { store_id: store.id, video_id: video.id, visitor_id: "v1" },
        { store_id: store.id, video_id: video.id, visitor_id: "v2" },
      ],
    });
    await prisma.comment.createMany({
      data: [
        { store_id: store.id, video_id: video.id, body: "?", status: "pending" },
        { store_id: store.id, video_id: video.id, body: "ok", status: "approved" },
      ],
    });

    const response = await request(app.server)
      .get("/api/analytics/dashboard-counts")
      .query({ store_id: store.id })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      active_videos: 1,
      total_likes: 2,
      pending_comments: 1,
    });
  });
});
