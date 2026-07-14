import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";
import { createVideo } from "../../../test/utils/create-video";

describe("GET /api/videos/:videoId (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the video for a member", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const video = await createVideo({ storeId: store.id, title: "Para Duplicar" });

    const response = await request(app.server)
      .get(`/api/videos/${video.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.video).toMatchObject({ id: video.id, title: "Para Duplicar" });
    expect(Array.isArray(response.body.video.video_products)).toBe(true);
  });

  it("treats deleted videos as 404", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const video = await createVideo({ storeId: store.id, status: "deleted" });

    const response = await request(app.server)
      .get(`/api/videos/${video.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
  });

  it("rejects non-members with 403", async () => {
    const { store } = await createStore();
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });
    const video = await createVideo({ storeId: store.id });

    const response = await request(app.server)
      .get(`/api/videos/${video.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });
});
