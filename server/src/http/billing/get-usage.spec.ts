import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { createVideo } from "../../../test/utils/create-video";

describe("GET /api/billing/usage (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns month usage counters", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const video = await createVideo({ storeId: store.id });
    await prisma.widget.create({
      data: { store_id: store.id, name: "W", type: "floating_video", status: "active" },
    });
    await prisma.analyticsEvent.createMany({
      data: [
        { store_id: store.id, video_id: video.id, event_type: "video_view" },
        { store_id: store.id, video_id: video.id, event_type: "video_view" },
      ],
    });

    const response = await request(app.server)
      .get("/api/billing/usage")
      .query({ store_id: store.id })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      active_videos: 1,
      month_views: 2,
      active_widgets: 1,
    });
  });
});
