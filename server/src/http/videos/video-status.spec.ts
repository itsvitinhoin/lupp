import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { env } from "@/env";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";

const BUNNY = {
  libraryId: "lib-123",
  apiKey: "bunny-test-key",
  cdnHostname: "cdn.example.b-cdn.net",
};

function stubFetch(body: unknown, status = 200) {
  const mock = vi.fn(
    async (_url: unknown, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

async function createVideo(
  storeId: string,
  overrides: Partial<{
    provider: string;
    provider_video_id: string | null;
  }> = {},
) {
  return prisma.video.create({
    data: {
      store_id: storeId,
      title: "Test video",
      provider: overrides.provider ?? "bunny",
      provider_video_id:
        overrides.provider_video_id === undefined
          ? "guid-status-1"
          : overrides.provider_video_id,
      processing_status: "processing",
    },
  });
}

describe("POST /api/videos/status (e2e)", () => {
  beforeAll(async () => {
    env.BUNNY_STREAM_LIBRARY_ID = BUNNY.libraryId;
    env.BUNNY_STREAM_API_KEY = BUNNY.apiKey;
    env.BUNNY_STREAM_CDN_HOSTNAME = BUNNY.cdnHostname;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires authentication", async () => {
    const response = await request(app.server)
      .post("/api/videos/status")
      .send({ store_id: "any", video_id: "any" });

    expect(response.status).toBe(401);
  });

  it("rejects missing store_id and missing video ids with machine-readable codes", async () => {
    const user = await createUser();
    const token = app.jwt.sign({ sub: user.id, role: "agent" });

    const missingStore = await request(app.server)
      .post("/api/videos/status")
      .set("Authorization", `Bearer ${token}`)
      .send({ video_id: "some-video" });
    expect(missingStore.status).toBe(400);
    expect(missingStore.body).toEqual({ error: "missing_store_id" });

    const missingVideo = await request(app.server)
      .post("/api/videos/status")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: "some-store" });
    expect(missingVideo.status).toBe(400);
    expect(missingVideo.body).toEqual({ error: "missing_video_id" });
  });

  it("denies a user who is not a member of the store", async () => {
    const { store } = await createStore();
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/videos/status")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, video_id: "some-video" });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "store_access_denied" });
  });

  it("returns 404 when the videos row does not belong to the store", async () => {
    const { owner, store } = await createStore();
    const { store: otherStore } = await createStore();
    const video = await createVideo(otherStore.id);
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/videos/status")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, video_id: video.id });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "video_not_found" });
  });

  it("returns 400 when the videos row has no provider_video_id", async () => {
    const { owner, store } = await createStore();
    const video = await createVideo(store.id, { provider_video_id: null });
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/videos/status")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, video_id: video.id });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "missing_provider_video_id" });
  });

  it("refreshes the videos row from Bunny and returns the payload", async () => {
    const { owner, store } = await createStore();
    const video = await createVideo(store.id, {
      provider_video_id: "guid-ready-1",
    });
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const fetchMock = stubFetch({
      guid: "guid-ready-1",
      length: 42,
      status: 4,
      storageSize: 123456,
    });

    const response = await request(app.server)
      .post("/api/videos/status")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, video_id: video.id });

    expect(response.status).toBe(200);
    const playback = `https://${BUNNY.cdnHostname}/guid-ready-1/playlist.m3u8`;
    expect(response.body).toEqual({
      duration_seconds: 42,
      file_size: 123456,
      playback_url: playback,
      processing_status: "ready",
      provider_video_id: "guid-ready-1",
      thumbnail_url: `https://${BUNNY.cdnHostname}/guid-ready-1/thumbnail.jpg`,
      video_url: playback,
    });

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `https://video.bunnycdn.com/library/${BUNNY.libraryId}/videos/guid-ready-1`,
    );

    const updated = await prisma.video.findUniqueOrThrow({
      where: { id: video.id },
    });
    expect(updated.processing_status).toBe("ready");
    expect(updated.duration_seconds).toBe(42);
    expect(updated.file_size).toBe(BigInt(123456));
    expect(updated.playback_url).toBe(playback);
    expect(updated.video_url).toBe(playback);
    expect(updated.thumbnail_url).toBe(
      `https://${BUNNY.cdnHostname}/guid-ready-1/thumbnail.jpg`,
    );
  });

  it("marks the video failed when Bunny reports encode status 5", async () => {
    const { owner, store } = await createStore();
    const video = await createVideo(store.id, {
      provider_video_id: "guid-failed-1",
    });
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    stubFetch({ guid: "guid-failed-1", status: 5 });

    const response = await request(app.server)
      .post("/api/videos/status")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, video_id: video.id });

    expect(response.status).toBe(200);
    expect(response.body.processing_status).toBe("failed");
    expect(response.body.duration_seconds).toBeNull();
    expect(response.body.file_size).toBeNull();

    const updated = await prisma.video.findUniqueOrThrow({
      where: { id: video.id },
    });
    expect(updated.processing_status).toBe("failed");
    expect(updated.file_size).toBeNull();
  });

  it("answers from Bunny without touching the DB when only provider_video_id is sent", async () => {
    const { owner, store } = await createStore();
    const untouched = await createVideo(store.id, {
      provider_video_id: "guid-other",
    });
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    stubFetch({ guid: "guid-direct-1", length: 5, status: 3 });

    const response = await request(app.server)
      .post("/api/videos/status")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, provider_video_id: "guid-direct-1" });

    expect(response.status).toBe(200);
    expect(response.body.processing_status).toBe("processing");
    expect(response.body.provider_video_id).toBe("guid-direct-1");

    const still = await prisma.video.findUniqueOrThrow({
      where: { id: untouched.id },
    });
    expect(still.processing_status).toBe("processing");
    expect(still.provider_video_id).toBe("guid-other");
  });

  it("maps a Bunny failure to 502 with the provider message", async () => {
    const { owner, store } = await createStore();
    const video = await createVideo(store.id);
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    stubFetch({ message: "video not found" }, 500);

    const response = await request(app.server)
      .post("/api/videos/status")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, video_id: video.id });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: "video not found" });
  });
});
