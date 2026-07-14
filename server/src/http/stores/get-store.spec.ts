import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";

describe("GET /api/stores/:storeId (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the store for a member", async () => {
    const { owner, store } = await createStore({ name: "Minha Loja" });
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .get(`/api/stores/${store.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.store).toMatchObject({ id: store.id, name: "Minha Loja" });
  });

  it("rejects non-members with 403", async () => {
    const { store } = await createStore();
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });

    const response = await request(app.server)
      .get(`/api/stores/${store.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });
});
