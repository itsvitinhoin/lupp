import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { env } from "@/env";
import { prisma } from "@/lib/prisma";
import { PLAN_VIDEO_LIMITS } from "@/lib/plans";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";

const BUNNY = {
  libraryId: "lib-123",
  apiKey: "bunny-test-key",
  cdnHostname: "cdn.example.b-cdn.net",
};

function jsonFetchResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function stubFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  const mock = vi.fn(async (url: unknown, init?: RequestInit) =>
    handler(String(url), init),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("POST /api/videos/upload (e2e)", () => {
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
      .post("/api/videos/upload")
      .send({ action: "create" });

    expect(response.status).toBe(401);
  });

  it("returns 500 missing_bunny_stream_config when Bunny env is unset", async () => {
    const { owner } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    env.BUNNY_STREAM_API_KEY = undefined;
    try {
      const response = await request(app.server)
        .post("/api/videos/upload")
        .set("Authorization", `Bearer ${token}`)
        .send({ action: "create" });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "missing_bunny_stream_config" });
    } finally {
      env.BUNNY_STREAM_API_KEY = BUNNY.apiKey;
    }
  });

  it("rejects a missing x-store-id header", async () => {
    const user = await createUser();
    const token = app.jwt.sign({ sub: user.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/videos/upload")
      .set("Authorization", `Bearer ${token}`)
      .send({ action: "create" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "missing_store_id" });
  });

  it("rejects a request without a body", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/videos/upload")
      .set("Authorization", `Bearer ${token}`)
      .set("x-store-id", store.id);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "missing_video_body" });
  });

  it("denies a user who is not a member of the store", async () => {
    const { store } = await createStore();
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/videos/upload")
      .set("Authorization", `Bearer ${token}`)
      .set("x-store-id", store.id)
      .send({ action: "create" });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "store_access_denied" });
  });

  it("returns 402 plan_video_limit_reached once the plan's video count is used up", async () => {
    const { owner, store } = await createStore({ plan_id: "start" });
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const fetchMock = stubFetch(() => jsonFetchResponse({}));

    await prisma.video.createMany({
      data: Array.from({ length: PLAN_VIDEO_LIMITS.start }, (_, index) => ({
        store_id: store.id,
        title: `video-${index}`,
        status: "active" as const,
      })),
    });

    const response = await request(app.server)
      .post("/api/videos/upload")
      .set("Authorization", `Bearer ${token}`)
      .set("x-store-id", store.id)
      .send({
        action: "create",
        file_name: "clip.mp4",
        file_size: 1234,
        file_type: "video/mp4",
      });

    expect(response.status).toBe(402);
    expect(response.body).toEqual({ error: "plan_video_limit_reached" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores archived/deleted videos when counting against the plan limit", async () => {
    const { owner, store } = await createStore({ plan_id: "start" });
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    stubFetch(() => jsonFetchResponse({ guid: "guid-under-limit" }));

    await prisma.video.createMany({
      data: Array.from({ length: PLAN_VIDEO_LIMITS.start }, (_, index) => ({
        store_id: store.id,
        title: `video-${index}`,
        status: "deleted" as const,
      })),
    });

    const response = await request(app.server)
      .post("/api/videos/upload")
      .set("Authorization", `Bearer ${token}`)
      .set("x-store-id", store.id)
      .send({
        action: "create",
        file_name: "clip.mp4",
        file_size: 1234,
        file_type: "video/mp4",
      });

    expect(response.status).toBe(200);
  });

  it("validates file_type and file_size on action=create", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const badType = await request(app.server)
      .post("/api/videos/upload")
      .set("Authorization", `Bearer ${token}`)
      .set("x-store-id", store.id)
      .send({ action: "create", file_size: 10, file_type: "image/png" });
    expect(badType.status).toBe(400);
    expect(badType.body).toEqual({ error: "invalid_video_content_type" });

    const noSize = await request(app.server)
      .post("/api/videos/upload")
      .set("Authorization", `Bearer ${token}`)
      .set("x-store-id", store.id)
      .send({ action: "create", file_type: "video/mp4" });
    expect(noSize.status).toBe(400);
    expect(noSize.body).toEqual({ error: "missing_file_size" });
  });

  it("rejects an unknown action", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/videos/upload")
      .set("Authorization", `Bearer ${token}`)
      .set("x-store-id", store.id)
      .send({ action: "publish" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "invalid_bunny_upload_action" });
  });

  it("action=create returns presigned TUS upload credentials", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const fetchMock = stubFetch(() =>
      jsonFetchResponse({ guid: "guid-created-1" }),
    );

    const response = await request(app.server)
      .post("/api/videos/upload")
      .set("Authorization", `Bearer ${token}`)
      .set("x-store-id", store.id)
      .send({
        action: "create",
        file_name: "my clip.mp4",
        file_size: 2048,
        file_type: "video/mp4",
        title: "My clip",
      });

    expect(response.status).toBe(200);
    const playback = `https://${BUNNY.cdnHostname}/guid-created-1/playlist.m3u8`;
    expect(response.body).toEqual({
      authorization_expire: expect.any(Number),
      authorization_signature: createHash("sha256")
        .update(
          `${BUNNY.libraryId}${BUNNY.apiKey}${response.body.authorization_expire}guid-created-1`,
        )
        .digest("hex"),
      cdn_hostname: BUNNY.cdnHostname,
      library_id: BUNNY.libraryId,
      path: "guid-created-1",
      playback_url: playback,
      provider: "bunny",
      provider_video_id: "guid-created-1",
      thumbnail_url: `https://${BUNNY.cdnHostname}/guid-created-1/thumbnail.jpg`,
      tus_endpoint: "https://video.bunnycdn.com/tusupload",
      url: playback,
    });
    // Signature expires ~4h out.
    expect(response.body.authorization_expire).toBeGreaterThan(
      Math.floor(Date.now() / 1000) + 60 * 60 * 3,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      `https://video.bunnycdn.com/library/${BUNNY.libraryId}/videos`,
    );
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).AccessKey).toBe(
      BUNNY.apiKey,
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      thumbnailTime: 1000,
      title: "My clip",
    });
  });

  it("action=metadata returns the mapped Bunny video state", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const fetchMock = stubFetch(() =>
      jsonFetchResponse({
        guid: "guid-meta-1",
        length: 42,
        status: 4,
        storageSize: 123456,
      }),
    );

    const response = await request(app.server)
      .post("/api/videos/upload")
      .set("Authorization", `Bearer ${token}`)
      .set("x-store-id", store.id)
      .send({ action: "metadata", provider_video_id: "guid-meta-1" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      duration_seconds: 42,
      file_size: 123456,
      path: "guid-meta-1",
      processing_status: "ready",
      provider: "bunny",
      provider_video_id: "guid-meta-1",
      status: "ready",
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `https://video.bunnycdn.com/library/${BUNNY.libraryId}/videos/guid-meta-1`,
    );
  });

  it("action=delete removes the Bunny video", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const fetchMock = stubFetch(() => jsonFetchResponse({}));

    const response = await request(app.server)
      .post("/api/videos/upload")
      .set("Authorization", `Bearer ${token}`)
      .set("x-store-id", store.id)
      .send({ action: "delete", provider_video_id: "guid-del-1" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      `https://video.bunnycdn.com/library/${BUNNY.libraryId}/videos/guid-del-1`,
    );
    expect(init?.method).toBe("DELETE");
  });

  it("maps a Bunny failure to 502 with the provider message", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    stubFetch(() => jsonFetchResponse({ message: "library not found" }, 500));

    const response = await request(app.server)
      .post("/api/videos/upload")
      .set("Authorization", `Bearer ${token}`)
      .set("x-store-id", store.id)
      .send({
        action: "create",
        file_size: 10,
        file_type: "video/mp4",
      });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: "library not found" });
  });

  it("rejects a raw body with an unaccepted video content type", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/videos/upload")
      .set("Authorization", `Bearer ${token}`)
      .set("x-store-id", store.id)
      .set("Content-Type", "video/avi")
      .send(Buffer.from("not-really-a-video"));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "invalid_video_content_type" });
  });

  it("raw binary mode creates the video, PUTs the bytes and returns metadata", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const bytes = Buffer.from("fake-mp4-bytes");
    const fetchMock = stubFetch((url, init) => {
      if (init?.method === "POST") {
        return jsonFetchResponse({ guid: "guid-raw-1" });
      }
      if (init?.method === "PUT") {
        return jsonFetchResponse({ success: true });
      }
      return jsonFetchResponse({
        guid: "guid-raw-1",
        length: 7,
        status: 3,
        storageSize: 0,
      });
    });

    const response = await request(app.server)
      .post("/api/videos/upload")
      .set("Authorization", `Bearer ${token}`)
      .set("x-store-id", store.id)
      .set("x-file-name", encodeURIComponent("féria.mp4"))
      .set("x-video-title", encodeURIComponent("Férias"))
      .set("Content-Type", "video/mp4")
      .send(bytes);

    expect(response.status).toBe(200);
    const playback = `https://${BUNNY.cdnHostname}/guid-raw-1/playlist.m3u8`;
    expect(response.body).toEqual({
      duration_seconds: 7,
      // storageSize 0 falls back to the request's content-length.
      file_size: bytes.length,
      path: "guid-raw-1",
      playback_url: playback,
      processing_status: "processing",
      provider: "bunny",
      provider_video_id: "guid-raw-1",
      status: "processing",
      thumbnail_url: `https://${BUNNY.cdnHostname}/guid-raw-1/thumbnail.jpg`,
      url: playback,
      video_url: playback,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [createUrl, createInit] = fetchMock.mock.calls[0];
    expect(String(createUrl)).toBe(
      `https://video.bunnycdn.com/library/${BUNNY.libraryId}/videos`,
    );
    expect(JSON.parse(String(createInit?.body))).toEqual({
      thumbnailTime: 1000,
      title: "Férias",
    });
    const [putUrl, putInit] = fetchMock.mock.calls[1];
    expect(String(putUrl)).toBe(
      `https://video.bunnycdn.com/library/${BUNNY.libraryId}/videos/guid-raw-1`,
    );
    expect(putInit?.method).toBe("PUT");
    expect(Buffer.from(putInit?.body as Uint8Array)).toEqual(bytes);
  });

  it("raw binary mode deletes the half-created Bunny video when the PUT fails", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const fetchMock = stubFetch((url, init) => {
      if (init?.method === "POST") {
        return jsonFetchResponse({ guid: "guid-raw-2" });
      }
      if (init?.method === "PUT") {
        return jsonFetchResponse({ message: "upload rejected" }, 500);
      }
      return jsonFetchResponse({});
    });

    const response = await request(app.server)
      .post("/api/videos/upload")
      .set("Authorization", `Bearer ${token}`)
      .set("x-store-id", store.id)
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from("fake-bytes"));

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: "upload rejected" });

    const deleteCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "DELETE",
    );
    expect(deleteCall).toBeDefined();
    expect(String(deleteCall![0])).toBe(
      `https://video.bunnycdn.com/library/${BUNNY.libraryId}/videos/guid-raw-2`,
    );
  });
});
