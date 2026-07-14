import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { createVideo } from "../../../test/utils/create-video";

describe("GET /api/videos/metrics (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("aggregates views, clicks, likes, comments and revenue per video", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const video = await createVideo({ storeId: store.id });
    const quiet = await createVideo({ storeId: store.id });

    await prisma.analyticsEvent.createMany({
      data: [
        { store_id: store.id, video_id: video.id, event_type: "video_view" },
        { store_id: store.id, video_id: video.id, event_type: "video_view" },
        { store_id: store.id, video_id: video.id, event_type: "product_click" },
        {
          store_id: store.id,
          video_id: video.id,
          event_type: "add_to_cart_click",
          metadata: { revenue: 99.5 },
        },
      ],
    });
    await prisma.videoLike.createMany({
      data: [
        { store_id: store.id, video_id: video.id, visitor_id: "visitor-1" },
        { store_id: store.id, video_id: video.id, visitor_id: "visitor-2" },
      ],
    });
    await prisma.comment.createMany({
      data: [
        { store_id: store.id, video_id: video.id, body: "Amei", status: "approved" },
        { store_id: store.id, video_id: video.id, body: "Spam", status: "deleted" },
      ],
    });

    const response = await request(app.server)
      .get("/api/videos/metrics")
      .query({ store_id: store.id, video_ids: `${video.id},${quiet.id}` })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    const byId = Object.fromEntries(
      response.body.metrics.map((m: any) => [m.video_id, m]),
    );
    expect(byId[video.id]).toMatchObject({
      views: 2,
      clicks: 2,
      likes: 2,
      comments: 1,
      revenue: 99.5,
    });
    expect(byId[quiet.id]).toMatchObject({ views: 0, likes: 0, comments: 0 });
  });
});
