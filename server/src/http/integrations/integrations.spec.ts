import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";

describe("integrations (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("lists integrations without the credentials column", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    await prisma.integration.create({
      data: {
        store_id: store.id,
        provider: "nuvemshop",
        status: "active",
        credentials: { secret: "never-expose" },
        settings: { store_domain: "loja.example.com" },
      },
    });

    const response = await request(app.server)
      .get("/api/integrations")
      .query({ store_id: store.id })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.integrations).toHaveLength(1);
    expect(response.body.integrations[0].provider).toBe("nuvemshop");
    expect(response.body.integrations[0].credentials).toBeUndefined();
  });

  it("upserts tracking settings, flipping status on enabled", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const created = await request(app.server)
      .put("/api/integrations/tracking")
      .set("Authorization", `Bearer ${token}`)
      .send({
        store_id: store.id,
        provider: "ga4",
        settings: { enabled: "true", measurement_id: "G-XYZ" },
      });
    expect(created.status).toBe(200);
    expect(created.body.integration).toMatchObject({ provider: "ga4", status: "active" });

    const disabled = await request(app.server)
      .put("/api/integrations/tracking")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, provider: "ga4", settings: { enabled: "false" } });
    expect(disabled.body.integration.status).toBe("available");
    expect(await prisma.integration.count({ where: { store_id: store.id } })).toBe(1);
  });

  it("rejects non-members with 403", async () => {
    const { store } = await createStore();
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });

    const response = await request(app.server)
      .get("/api/integrations")
      .query({ store_id: store.id })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });
});
