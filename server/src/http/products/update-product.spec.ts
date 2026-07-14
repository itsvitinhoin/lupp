import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";

describe("PATCH /api/products/:productId (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("updates a product for a member", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const product = await prisma.product.create({
      data: { store_id: store.id, name: "Antes", price: 10 },
    });

    const response = await request(app.server)
      .patch(`/api/products/${product.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Depois", status: "archived" });

    expect(response.status).toBe(200);
    expect(response.body.product).toMatchObject({ name: "Depois", status: "archived", price: 10 });
  });

  it("returns 404 for an unknown product", async () => {
    const { owner } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .patch("/api/products/00000000-0000-7000-8000-000000000000")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Nada" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "product_not_found" });
  });

  it("rejects members of other stores with 403", async () => {
    const { store } = await createStore();
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });
    const product = await prisma.product.create({
      data: { store_id: store.id, name: "Protegido" },
    });

    const response = await request(app.server)
      .patch(`/api/products/${product.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Hackeado" });

    expect(response.status).toBe(403);
  });
});
