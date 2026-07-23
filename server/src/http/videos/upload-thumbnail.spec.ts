import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { env } from "@/env";
import { createStore } from "../../../test/utils/create-store";

const JPG_BYTES = Buffer.from("ffd8ffe000104a464946", "hex");

describe("POST /api/videos/thumbnail (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // These tests assert an exact "unconfigured" and "default hostname" state,
  // which must not depend on whatever real Bunny credentials happen to be
  // set in this machine's .env (needed for actually exercising the real API
  // elsewhere) — reset to a known-clean baseline before every test, not just
  // after the tests that opt into real values.
  beforeEach(() => {
    env.BUNNY_STORAGE_ZONE_NAME = undefined;
    env.BUNNY_STORAGE_API_KEY = undefined;
    env.BUNNY_STORAGE_CDN_HOSTNAME = undefined;
    env.BUNNY_STORAGE_HOSTNAME = "storage.bunnycdn.com";
  });

  afterEach(() => {
    env.BUNNY_STORAGE_ZONE_NAME = undefined;
    env.BUNNY_STORAGE_API_KEY = undefined;
    env.BUNNY_STORAGE_CDN_HOSTNAME = undefined;
    env.BUNNY_STORAGE_HOSTNAME = "storage.bunnycdn.com";
    vi.unstubAllGlobals();
  });

  it("answers 500 when the storage zone is not configured", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/videos/thumbnail")
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "image/jpeg")
      .set("x-store-id", store.id)
      .set("x-file-name", "thumb.jpg")
      .send(JPG_BYTES);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "missing_bunny_storage_config" });
  });

  it("uploads the thumbnail and returns the CDN URL", async () => {
    env.BUNNY_STORAGE_ZONE_NAME = "lupp-test-zone";
    env.BUNNY_STORAGE_API_KEY = "storage-key";
    env.BUNNY_STORAGE_CDN_HOSTNAME = "lupp-test.b-cdn.net";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 201 })),
    );

    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/videos/thumbnail")
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "image/jpeg")
      .set("x-store-id", store.id)
      .set("x-file-name", "thumb.jpg")
      .send(JPG_BYTES);

    expect(response.status).toBe(200);
    expect(response.body.url).toMatch(
      new RegExp(`^https://lupp-test\\.b-cdn\\.net/${store.id}/thumbnails/[0-9a-f-]+\\.jpg$`),
    );
  });

  it("requires the x-store-id header", async () => {
    const { owner } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/videos/thumbnail")
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "image/jpeg")
      .send(JPG_BYTES);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "missing_store_id" });
  });
});
