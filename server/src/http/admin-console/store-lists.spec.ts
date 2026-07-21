import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";
import { AdminConsoleRoutes } from "./routes";

// The orchestrator wires AdminConsoleRoutes into src/routes.ts; until then
// the spec registers the domain itself (guarded to avoid duplicate routes).
const routesWired = readFileSync(new URL("../../routes.ts", import.meta.url), "utf8").includes(
  "AdminConsoleRoutes",
);

describe("GET /api/admin-console/stores/:storeId/{products,videos,comments} (e2e)", () => {
  let adminToken: string;

  beforeAll(async () => {
    if (!routesWired) await app.register(AdminConsoleRoutes);
    await app.ready();
    const admin = await createUser({ role: "admin" });
    adminToken = app.jwt.sign({ sub: admin.id, role: "admin" });
  });

  afterAll(async () => {
    await app.close();
  });

  it("gates on the admin role and an existing store", async () => {
    const outsiderToken = app.jwt.sign({ sub: randomUUID(), role: "agent" });
    const denied = await request(app.server)
      .get(`/api/admin-console/stores/${randomUUID()}/products`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(denied.status).toBe(401);

    const missing = await request(app.server)
      .get(`/api/admin-console/stores/${randomUUID()}/videos`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: "store_not_found" });
  });

  it("paginates products with a cursor and searches by name/external id", async () => {
    const { store } = await createStore();
    await prisma.product.createMany({
      data: Array.from({ length: 25 }, (_, index) => ({
        store_id: store.id,
        name: `Produto ${index}`,
        external_id: `ext-${index}`,
        platform: "nuvemshop",
      })),
    });

    const firstPage = await request(app.server)
      .get(`/api/admin-console/stores/${store.id}/products`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.items).toHaveLength(20);
    expect(firstPage.body.next_cursor).toBe(firstPage.body.items[19].id);
    expect(firstPage.body.items[0]._count).toEqual({
      variants: 0,
      video_products: 0,
    });

    const secondPage = await request(app.server)
      .get(
        `/api/admin-console/stores/${store.id}/products?cursor=${firstPage.body.next_cursor}`,
      )
      .set("Authorization", `Bearer ${adminToken}`);
    expect(secondPage.body.items).toHaveLength(5);
    expect(secondPage.body.next_cursor).toBeNull();

    const allIds = [...firstPage.body.items, ...secondPage.body.items].map(
      (item: { id: string }) => item.id,
    );
    expect(new Set(allIds).size).toBe(25);

    const byName = await request(app.server)
      .get(`/api/admin-console/stores/${store.id}/products?search=produto 7`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(byName.body.items).toHaveLength(1);
    expect(byName.body.items[0].name).toBe("Produto 7");

    const byExternalId = await request(app.server)
      .get(`/api/admin-console/stores/${store.id}/products?search=EXT-12`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(byExternalId.body.items).toHaveLength(1);
  });

  it("lists videos with counts and searches by title/description", async () => {
    const { store } = await createStore();
    const video = await prisma.video.create({
      data: {
        store_id: store.id,
        title: "Look de verão",
        description: "Praia e piscina",
        status: "active",
        processing_status: "ready",
      },
    });
    await prisma.video.create({
      data: { store_id: store.id, title: "Inverno", status: "draft" },
    });
    await prisma.comment.create({
      data: { store_id: store.id, video_id: video.id, body: "Amei o look!" },
    });
    await prisma.videoLike.create({
      data: { store_id: store.id, video_id: video.id, visitor_id: "v1" },
    });

    const all = await request(app.server)
      .get(`/api/admin-console/stores/${store.id}/videos`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(all.body.items).toHaveLength(2);
    expect(all.body.next_cursor).toBeNull();

    const summer = await request(app.server)
      .get(`/api/admin-console/stores/${store.id}/videos?search=piscina`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(summer.body.items).toHaveLength(1);
    expect(summer.body.items[0]).toMatchObject({
      id: video.id,
      title: "Look de verão",
      _count: { video_products: 0, comments: 1, likes: 1 },
    });
  });

  it("lists comments with their video and searches by body/author", async () => {
    const { store } = await createStore();
    const video = await prisma.video.create({
      data: { store_id: store.id, title: "Vídeo" },
    });
    await prisma.comment.createMany({
      data: [
        {
          store_id: store.id,
          video_id: video.id,
          body: "Chegou rápido",
          author_name: "Ana",
        },
        {
          store_id: store.id,
          video_id: video.id,
          body: "Qual o tamanho?",
          author_email: "bruno@example.com",
        },
      ],
    });

    const all = await request(app.server)
      .get(`/api/admin-console/stores/${store.id}/comments`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(all.body.items).toHaveLength(2);
    expect(all.body.items[0].video).toEqual({ id: video.id, title: "Vídeo" });

    const byAuthor = await request(app.server)
      .get(`/api/admin-console/stores/${store.id}/comments?search=BRUNO`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(byAuthor.body.items).toHaveLength(1);
    expect(byAuthor.body.items[0].body).toBe("Qual o tamanho?");
  });
});
