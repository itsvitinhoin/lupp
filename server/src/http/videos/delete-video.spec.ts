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

async function createVideoWithProduct(
  storeId: string,
  overrides: Partial<{
    provider: string;
    provider_video_id: string | null;
  }> = {},
) {
  const video = await prisma.video.create({
    data: {
      store_id: storeId,
      title: "Video to delete",
      provider: overrides.provider ?? "bunny",
      provider_video_id:
        overrides.provider_video_id === undefined
          ? "guid-delete-1"
          : overrides.provider_video_id,
    },
  });
  const product = await prisma.product.create({
    data: { store_id: storeId, name: "Linked product" },
  });
  const link = await prisma.videoProduct.create({
    data: { video_id: video.id, product_id: product.id },
  });
  return { video, product, link };
}

describe("POST /api/videos/delete (e2e)", () => {
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
      .post("/api/videos/delete")
      .send({ store_id: "any", video_id: "any" });

    expect(response.status).toBe(401);
  });

  it("rejects missing store_id and video_id with machine-readable codes", async () => {
    const user = await createUser();
    const token = app.jwt.sign({ sub: user.id, role: "agent" });

    const missingStore = await request(app.server)
      .post("/api/videos/delete")
      .set("Authorization", `Bearer ${token}`)
      .send({ video_id: "some-video" });
    expect(missingStore.status).toBe(400);
    expect(missingStore.body).toEqual({ error: "missing_store_id" });

    const missingVideo = await request(app.server)
      .post("/api/videos/delete")
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
      .post("/api/videos/delete")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, video_id: "some-video" });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "store_access_denied" });
  });

  it("returns 404 when the video does not belong to the store", async () => {
    const { owner, store } = await createStore();
    const { store: otherStore } = await createStore();
    const { video } = await createVideoWithProduct(otherStore.id);
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/videos/delete")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, video_id: video.id });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "video_not_found" });
  });

  it("deletes at Bunny, removes video_products links and the videos row", async () => {
    const { owner, store } = await createStore();
    const { video, product } = await createVideoWithProduct(store.id);
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const fetchMock = stubFetch({});

    const response = await request(app.server)
      .post("/api/videos/delete")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, video_id: video.id });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      `https://video.bunnycdn.com/library/${BUNNY.libraryId}/videos/guid-delete-1`,
    );
    expect(init?.method).toBe("DELETE");
    expect((init?.headers as Record<string, string>).AccessKey).toBe(
      BUNNY.apiKey,
    );

    expect(
      await prisma.video.findUnique({ where: { id: video.id } }),
    ).toBeNull();
    expect(
      await prisma.videoProduct.findMany({ where: { video_id: video.id } }),
    ).toEqual([]);
    // The linked product itself survives.
    expect(
      await prisma.product.findUnique({ where: { id: product.id } }),
    ).not.toBeNull();
  });

  it("still deletes locally when Bunny answers 404", async () => {
    const { owner, store } = await createStore();
    const { video } = await createVideoWithProduct(store.id);
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    stubFetch({ message: "not found" }, 404);

    const response = await request(app.server)
      .post("/api/videos/delete")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, video_id: video.id });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(
      await prisma.video.findUnique({ where: { id: video.id } }),
    ).toBeNull();
  });

  it("keeps the row and returns 502 when Bunny fails", async () => {
    const { owner, store } = await createStore();
    const { video, link } = await createVideoWithProduct(store.id);
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    stubFetch({ message: "bunny exploded" }, 500);

    const response = await request(app.server)
      .post("/api/videos/delete")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, video_id: video.id });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: "bunny exploded" });
    expect(
      await prisma.video.findUnique({ where: { id: video.id } }),
    ).not.toBeNull();
    expect(
      await prisma.videoProduct.findUnique({ where: { id: link.id } }),
    ).not.toBeNull();
  });

  it("skips the Bunny call for non-bunny providers", async () => {
    const { owner, store } = await createStore();
    const { video } = await createVideoWithProduct(store.id, {
      provider: "supabase",
      provider_video_id: null,
    });
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const fetchMock = stubFetch({});

    const response = await request(app.server)
      .post("/api/videos/delete")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, video_id: video.id });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      await prisma.video.findUnique({ where: { id: video.id } }),
    ).toBeNull();
  });
});
