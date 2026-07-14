import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { createVideo } from "../../../test/utils/create-video";

describe("PATCH /api/videos/ordering (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("bulk-updates sort_order and is_featured, scoped to the store", async () => {
    const { owner, store } = await createStore();
    const { store: otherStore } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const a = await createVideo({ storeId: store.id, sort_order: 0 });
    const b = await createVideo({ storeId: store.id, sort_order: 1 });
    const foreign = await createVideo({ storeId: otherStore.id, sort_order: 5 });

    const response = await request(app.server)
      .patch("/api/videos/ordering")
      .set("Authorization", `Bearer ${token}`)
      .send({
        store_id: store.id,
        updates: [
          { id: a.id, is_featured: true, sort_order: 1 },
          { id: b.id, is_featured: false, sort_order: 0 },
          { id: foreign.id, is_featured: true, sort_order: 0 },
        ],
      });

    expect(response.status).toBe(200);
    const rowA = await prisma.video.findUniqueOrThrow({ where: { id: a.id } });
    const rowB = await prisma.video.findUniqueOrThrow({ where: { id: b.id } });
    const rowForeign = await prisma.video.findUniqueOrThrow({ where: { id: foreign.id } });
    expect(rowA).toMatchObject({ is_featured: true, sort_order: 1 });
    expect(rowB).toMatchObject({ is_featured: false, sort_order: 0 });
    // Cross-store id silently skipped.
    expect(rowForeign).toMatchObject({ is_featured: false, sort_order: 5 });
  });
});
