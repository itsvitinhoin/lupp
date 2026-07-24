import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { env } from "@/env";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";
import { createVideo } from "../../../test/utils/create-video";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

const BUNNY_VIDEOS_PAGE = {
  currentPage: 1,
  itemsPerPage: 25,
  totalItems: 2,
  items: [
    {
      guid: "matched-guid",
      title: "Matched video",
      dateUploaded: "2026-01-01T00:00:00",
      length: 12,
      status: 4,
      storageSize: 1000,
      views: 3,
      width: 1080,
      height: 1920,
      thumbnailFileName: "thumbnail.jpg",
    },
    {
      guid: "orphan-guid",
      title: "Orphan video",
      dateUploaded: "2026-01-02T00:00:00",
      length: 5,
      status: 4,
      storageSize: 500,
      views: 0,
      width: 720,
      height: 1280,
      thumbnailFileName: "thumbnail.jpg",
    },
  ],
};

describe("admin console Bunny video management (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    env.BUNNY_STREAM_LIBRARY_ID = "686560";
    env.BUNNY_STREAM_API_KEY = "stream-key";
    env.BUNNY_STREAM_CDN_HOSTNAME = "vz-test.b-cdn.net";
  });

  it("rejects a non-admin caller", async () => {
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });

    const response = await request(app.server)
      .get("/api/admin-console/bunny/videos")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
  });

  it("lists Bunny videos enriched with the matching local video's store/product", async () => {
    env.BUNNY_STREAM_LIBRARY_ID = "686560";
    env.BUNNY_STREAM_API_KEY = "stream-key";
    env.BUNNY_STREAM_CDN_HOSTNAME = "vz-test.b-cdn.net";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(BUNNY_VIDEOS_PAGE)),
    );

    const { store } = await createStore();
    const product = await prisma.product.create({
      data: { store_id: store.id, name: "Vestido Teste", platform: "upzero" },
    });
    const video = await createVideo({ storeId: store.id, provider_video_id: "matched-guid" });
    await prisma.video.update({
      where: { id: video.id },
      data: { provider: "bunny" },
    });
    await prisma.videoProduct.create({
      data: { video_id: video.id, product_id: product.id, is_primary: true },
    });

    const admin = await createUser({ role: "admin" });
    const token = app.jwt.sign({ sub: admin.id, role: "admin" });

    const response = await request(app.server)
      .get("/api/admin-console/bunny/videos")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.totalItems).toBe(2);
    const [matched, orphan] = response.body.items;
    expect(matched.guid).toBe("matched-guid");
    expect(matched.db).toMatchObject({
      id: video.id,
      store: { id: store.id },
      products: [{ id: product.id, name: "Vestido Teste" }],
    });
    expect(matched.thumbnailUrl).toBe(
      "https://vz-test.b-cdn.net/matched-guid/thumbnail.jpg",
    );
    expect(orphan.guid).toBe("orphan-guid");
    expect(orphan.db).toBeNull();
  });

  it("returns the usage summary combining Bunny's library info with the local aggregate", async () => {
    env.BUNNY_STREAM_LIBRARY_ID = "686560";
    env.BUNNY_STREAM_API_KEY = "stream-key";
    env.BUNNY_STREAM_CDN_HOSTNAME = "vz-test.b-cdn.net";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ videoCount: 302, liveStreamCount: 0, collectionCount: 0 }),
      ),
    );

    const { store } = await createStore();
    const video = await createVideo({ storeId: store.id, provider_video_id: "matched-guid" });
    await prisma.video.update({
      where: { id: video.id },
      data: { provider: "bunny", file_size: 123456 },
    });

    const admin = await createUser({ role: "admin" });
    const token = app.jwt.sign({ sub: admin.id, role: "admin" });

    const response = await request(app.server)
      .get("/api/admin-console/bunny/summary")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.bunny_video_count).toBe(302);
    expect(response.body.local_video_count).toBeGreaterThanOrEqual(1);
    expect(BigInt(response.body.local_storage_bytes)).toBeGreaterThanOrEqual(123456n);
    expect(response.body.library_id).toBe("686560");
  });

  it("deletes a video with a local row: Bunny asset + video_products + row all removed", async () => {
    env.BUNNY_STREAM_LIBRARY_ID = "686560";
    env.BUNNY_STREAM_API_KEY = "stream-key";
    env.BUNNY_STREAM_CDN_HOSTNAME = "vz-test.b-cdn.net";
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { store } = await createStore();
    const product = await prisma.product.create({
      data: { store_id: store.id, name: "Produto", platform: "upzero" },
    });
    const video = await createVideo({ storeId: store.id, provider_video_id: "delete-me-guid" });
    await prisma.video.update({ where: { id: video.id }, data: { provider: "bunny" } });
    await prisma.videoProduct.create({
      data: { video_id: video.id, product_id: product.id, is_primary: true },
    });

    const admin = await createUser({ role: "admin" });
    const token = app.jwt.sign({ sub: admin.id, role: "admin" });

    const response = await request(app.server)
      .delete("/api/admin-console/bunny/videos/delete-me-guid")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);

    const [deleteCall] = fetchMock.mock.calls;
    expect(String(deleteCall[0])).toContain("/videos/delete-me-guid");
    expect(deleteCall[1].method).toBe("DELETE");

    await expect(prisma.video.findUnique({ where: { id: video.id } })).resolves.toBeNull();
    await expect(
      prisma.videoProduct.findFirst({ where: { video_id: video.id } }),
    ).resolves.toBeNull();
  });

  it("deletes an orphaned Bunny video with no local row without touching the database", async () => {
    env.BUNNY_STREAM_LIBRARY_ID = "686560";
    env.BUNNY_STREAM_API_KEY = "stream-key";
    env.BUNNY_STREAM_CDN_HOSTNAME = "vz-test.b-cdn.net";
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const admin = await createUser({ role: "admin" });
    const token = app.jwt.sign({ sub: admin.id, role: "admin" });

    const response = await request(app.server)
      .delete("/api/admin-console/bunny/videos/never-synced-guid")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/videos/never-synced-guid");
  });
});
