import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";

describe("POST /api/products (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates a product for a member", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, name: "Produto Novo", price: 49.9, currency: "BRL" });

    expect(response.status).toBe(201);
    expect(response.body.product).toMatchObject({ name: "Produto Novo", price: 49.9 });

    const row = await prisma.product.findUniqueOrThrow({
      where: { id: response.body.product.id },
    });
    expect(row.store_id).toBe(store.id);
  });

  it("returns 409 for a duplicate (store, platform, external_id)", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const payload = {
      store_id: store.id,
      name: "Duplicado",
      platform: "nuvemshop",
      external_id: "ext-1",
    };

    await request(app.server).post("/api/products").set("Authorization", `Bearer ${token}`).send(payload);
    const duplicate = await request(app.server)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toEqual({ error: "product_already_exists" });
  });

  it("rejects non-members with 403", async () => {
    const { store } = await createStore();
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, name: "Invasor" });

    expect(response.status).toBe(403);
  });
});
