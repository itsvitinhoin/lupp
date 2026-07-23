import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { env } from "@/env";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";

const PNG_BYTES = Buffer.from("89504e470d0a1a0a", "hex");

function configureBunnyStorage() {
  env.BUNNY_STORAGE_ZONE_NAME = "lupp-test-zone";
  env.BUNNY_STORAGE_API_KEY = "storage-key";
  env.BUNNY_STORAGE_CDN_HOSTNAME = "lupp-test.b-cdn.net";
}

describe("POST /api/stores/:storeId/logo (e2e)", () => {
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
      .post(`/api/stores/${store.id}/logo`)
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "image/png")
      .set("x-file-name", "logo.png")
      .send(PNG_BYTES);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "missing_bunny_storage_config" });
  });

  it("uploads the logo and returns the CDN URL", async () => {
    configureBunnyStorage();
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post(`/api/stores/${store.id}/logo`)
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "image/png")
      .set("x-file-name", "logo.png")
      .send(PNG_BYTES);

    expect(response.status).toBe(200);
    expect(response.body.url).toMatch(
      new RegExp(`^https://lupp-test\\.b-cdn\\.net/${store.id}/logos/[0-9a-f-]+\\.png$`),
    );

    const [uploadUrl, init] = fetchMock.mock.calls[0];
    expect(String(uploadUrl)).toContain("https://storage.bunnycdn.com/lupp-test-zone/");
    expect(init.method).toBe("PUT");
    expect(init.headers.AccessKey).toBe("storage-key");
  });

  it("rejects non-members with 403", async () => {
    configureBunnyStorage();
    const { store } = await createStore();
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });

    const response = await request(app.server)
      .post(`/api/stores/${store.id}/logo`)
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "image/png")
      .send(PNG_BYTES);

    expect(response.status).toBe(403);
  });
});
