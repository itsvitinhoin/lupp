import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";
import { createVideo } from "../../../test/utils/create-video";

describe("PATCH/DELETE /api/comments/:commentId (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("moderates a comment (approve)", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const video = await createVideo({ storeId: store.id });
    const comment = await prisma.comment.create({
      data: { store_id: store.id, video_id: video.id, body: "Oi", status: "pending" },
    });

    const response = await request(app.server)
      .patch(`/api/comments/${comment.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "approved" });

    expect(response.status).toBe(200);
    expect(response.body.comment.status).toBe("approved");
  });

  it("deletes a comment", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const video = await createVideo({ storeId: store.id });
    const comment = await prisma.comment.create({
      data: { store_id: store.id, video_id: video.id, body: "Some", status: "pending" },
    });

    const response = await request(app.server)
      .delete(`/api/comments/${comment.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(await prisma.comment.count({ where: { id: comment.id } })).toBe(0);
  });

  it("rejects members of other stores with 403", async () => {
    const { store } = await createStore();
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });
    const video = await createVideo({ storeId: store.id });
    const comment = await prisma.comment.create({
      data: { store_id: store.id, video_id: video.id, body: "Meu", status: "pending" },
    });

    const patched = await request(app.server)
      .patch(`/api/comments/${comment.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "approved" });
    expect(patched.status).toBe(403);

    const deleted = await request(app.server)
      .delete(`/api/comments/${comment.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(deleted.status).toBe(403);
  });
});
