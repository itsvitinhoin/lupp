import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";

describe("PATCH /api/stores/:storeId (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("updates identity fields for a member", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .patch(`/api/stores/${store.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Renomeada", button_color: "#ff0000", logo_url: "https://cdn/logo.png" });

    expect(response.status).toBe(200);
    expect(response.body.store).toMatchObject({
      name: "Renomeada",
      button_color: "#ff0000",
      logo_url: "https://cdn/logo.png",
    });
  });

  it("falls back to a suffixed slug on conflict", async () => {
    const { owner, store } = await createStore();
    await createStore({ slug: "ocupada" });
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .patch(`/api/stores/${store.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ slug: "ocupada" });

    expect(response.status).toBe(200);
    expect(response.body.store.slug).toBe(`ocupada-${store.id.slice(0, 6)}`);
  });

  it("rejects non-members with 403", async () => {
    const { store } = await createStore();
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });

    const response = await request(app.server)
      .patch(`/api/stores/${store.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Invasão" });

    expect(response.status).toBe(403);
  });
});
