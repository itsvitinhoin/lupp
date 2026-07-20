import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { env } from "@/env";
import { verifyNuvemshopState } from "@/lib/nuvemshop";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";

const STATE_SECRET = "test-state-secret";

describe("POST /api/integrations/nuvemshop/oauth/start (e2e)", () => {
  beforeAll(async () => {
    env.NUVEMSHOP_STATE_SECRET = STATE_SECRET;
    env.NUVEMSHOP_CLIENT_ID = "";
    env.NUVEMSHOP_APP_ID = "36726";
    env.NUVEMSHOP_AUTHORIZE_BASE_URL = "https://www.nuvemshop.com.br";
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires authentication", async () => {
    const response = await request(app.server)
      .post("/api/integrations/nuvemshop/oauth/start")
      .send({ store_id: "any" });

    expect(response.status).toBe(401);
  });

  it("rejects a missing store_id with a machine-readable code", async () => {
    const user = await createUser();
    const token = app.jwt.sign({ sub: user.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/integrations/nuvemshop/oauth/start")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "missing_store_id" });
  });

  it("denies a user who is not a member of the store", async () => {
    const { store } = await createStore();
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/integrations/nuvemshop/oauth/start")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "store_access_denied" });
  });

  it("builds the authorize URL with a verifiable signed state", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/integrations/nuvemshop/oauth/start")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(200);

    const authorizeUrl = new URL(response.body.authorize_url);
    expect(authorizeUrl.origin).toBe("https://www.nuvemshop.com.br");
    expect(authorizeUrl.pathname).toBe("/apps/36726/authorize");

    const state = authorizeUrl.searchParams.get("state");
    expect(state).toBeTruthy();

    const payload = verifyNuvemshopState(state!, STATE_SECRET);
    expect(payload).toMatchObject({
      store_id: store.id,
      user_id: owner.id,
      return_to: `${env.LUPP_APP_URL}/app/integrations`,
    });
    expect(typeof payload?.iat).toBe("number");

    // A tampered signature must not verify.
    expect(verifyNuvemshopState(`${state}x`, STATE_SECRET)).toBeNull();
    expect(verifyNuvemshopState(state!, "another-secret")).toBeNull();
  });

  it("honors a custom return_to in the signed state", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/integrations/nuvemshop/oauth/start")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, return_to: "  https://example.com/back  " });

    expect(response.status).toBe(200);
    const state = new URL(response.body.authorize_url).searchParams.get("state")!;
    expect(verifyNuvemshopState(state, STATE_SECRET)?.return_to).toBe(
      "https://example.com/back",
    );
  });
});
