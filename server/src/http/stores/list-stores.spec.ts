import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";

describe("GET /api/stores (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires authentication", async () => {
    const response = await request(app.server).get("/api/stores");
    expect(response.status).toBe(401);
  });

  it("returns only stores the user is a member of, oldest first", async () => {
    const { owner, store: first } = await createStore({ name: "Primeira" });
    const { store: second } = await createStore({ ownerId: owner.id, name: "Segunda" });
    await createStore({ name: "De Outra Pessoa" });
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .get("/api/stores")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.stores.map((s: any) => s.id)).toEqual([first.id, second.id]);
    expect(await prisma.store.count()).toBe(3);
  });
});
