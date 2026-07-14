import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";

describe("GET /api/products (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires authentication", async () => {
    const response = await request(app.server).get("/api/products").query({ store_id: "x" });
    expect(response.status).toBe(401);
  });

  it("rejects non-members with 403", async () => {
    const { store } = await createStore();
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });

    const response = await request(app.server)
      .get("/api/products")
      .query({ store_id: store.id })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "store_access_denied" });
  });

  it("lists only the store's products with filters, newest first", async () => {
    const { owner, store } = await createStore();
    const { store: otherStore } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    await prisma.product.createMany({
      data: [
        { store_id: store.id, name: "Tênis Azul", price: 199.9, status: "active" },
        { store_id: store.id, name: "Camisa Verde", status: "draft" },
        { store_id: otherStore.id, name: "Alheio", status: "active" },
      ],
    });

    const all = await request(app.server)
      .get("/api/products")
      .query({ store_id: store.id })
      .set("Authorization", `Bearer ${token}`);
    expect(all.status).toBe(200);
    expect(all.body.products).toHaveLength(2);
    expect(all.body.products.find((p: any) => p.name === "Tênis Azul").price).toBe(199.9);

    const searched = await request(app.server)
      .get("/api/products")
      .query({ store_id: store.id, search: "tênis" })
      .set("Authorization", `Bearer ${token}`);
    expect(searched.body.products).toHaveLength(1);

    const drafts = await request(app.server)
      .get("/api/products")
      .query({ store_id: store.id, status: "draft" })
      .set("Authorization", `Bearer ${token}`);
    expect(drafts.body.products.map((p: any) => p.name)).toEqual(["Camisa Verde"]);
  });
});
