import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";

describe("DELETE /api/products/:productId (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("deletes the product and cascades its variants", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const product = await prisma.product.create({
      data: { store_id: store.id, name: "Com Variante" },
    });
    await prisma.productVariant.create({
      data: {
        store_id: store.id,
        product_id: product.id,
        platform: "upzero",
        external_id: "var-1",
      },
    });

    const response = await request(app.server)
      .delete(`/api/products/${product.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(await prisma.product.count({ where: { id: product.id } })).toBe(0);
    expect(await prisma.productVariant.count({ where: { product_id: product.id } })).toBe(0);
  });

  it("returns 404 for an unknown product", async () => {
    const { owner } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .delete("/api/products/00000000-0000-7000-8000-000000000000")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
  });
});
