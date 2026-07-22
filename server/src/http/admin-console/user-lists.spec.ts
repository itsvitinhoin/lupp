import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";
import { AdminConsoleRoutes } from "./routes";

const routesWired = readFileSync(new URL("../../routes.ts", import.meta.url), "utf8").includes(
  "AdminConsoleRoutes",
);

describe("GET /api/admin-console/users (e2e)", () => {
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

  it("requires the admin role", async () => {
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });

    const response = await request(app.server)
      .get("/api/admin-console/users")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
  });

  it("cursor-paginates newest first", async () => {
    const emailStem = `cursor-${Date.now()}`;
    const first = await createUser({ email: `${emailStem}-a@example.com` });
    const second = await createUser({ email: `${emailStem}-b@example.com` });
    const third = await createUser({ email: `${emailStem}-c@example.com` });

    const page1 = await request(app.server)
      .get("/api/admin-console/users")
      .query({ limit: 2, search: emailStem })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(page1.status).toBe(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.next_cursor).not.toBeNull();
    expect(page1.body.items.map((u: { id: string }) => u.id)).toEqual([third.id, second.id]);

    const page2 = await request(app.server)
      .get("/api/admin-console/users")
      .query({ limit: 2, search: emailStem, cursor: page1.body.next_cursor })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(page2.status).toBe(200);
    expect(page2.body.items.map((u: { id: string }) => u.id)).toEqual([first.id]);
    expect(page2.body.next_cursor).toBeNull();
  });

  it("search matches name or email case-insensitively", async () => {
    const marker = `Findme-${Date.now()}`;
    const byName = await createUser({ name: `${marker} User` });
    const byEmail = await createUser({ email: `${marker.toLowerCase()}@example.com` });

    const response = await request(app.server)
      .get("/api/admin-console/users")
      .query({ search: marker.toLowerCase() })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    const ids = response.body.items.map((u: { id: string }) => u.id);
    expect(ids).toContain(byName.id);
    expect(ids).toContain(byEmail.id);
  });

  it("filters by role and email confirmation state", async () => {
    const marker = `role-filter-${Date.now()}`;
    const manager = await createUser({
      email: `${marker}-manager@example.com`,
      role: "manager",
      email_confirmed_at: null,
    });
    const agent = await createUser({
      email: `${marker}-agent@example.com`,
      role: "agent",
    });

    const roleFiltered = await request(app.server)
      .get("/api/admin-console/users")
      .query({ search: marker, role: "manager" })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(roleFiltered.body.items.map((u: { id: string }) => u.id)).toEqual([manager.id]);

    const unconfirmedFiltered = await request(app.server)
      .get("/api/admin-console/users")
      .query({ search: marker, email_confirmed: "false" })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(unconfirmedFiltered.body.items.map((u: { id: string }) => u.id)).toEqual([manager.id]);

    const confirmedFiltered = await request(app.server)
      .get("/api/admin-console/users")
      .query({ search: marker, email_confirmed: "true" })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(confirmedFiltered.body.items.map((u: { id: string }) => u.id)).toEqual([agent.id]);
  });

  it("store_id filters to the store's owner and members", async () => {
    const { owner, store } = await createStore();
    const teammateEmail = `store-filter-${Date.now()}@example.com`;
    const teammate = await createUser({ email: teammateEmail });
    await prisma.storeMember.create({
      data: { store_id: store.id, user_id: teammate.id, role: "editor" },
    });
    const outsider = await createUser();

    const response = await request(app.server)
      .get("/api/admin-console/users")
      .query({ store_id: store.id, limit: 50 })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    const ids = response.body.items.map((u: { id: string }) => u.id);
    expect(ids).toContain(owner.id);
    expect(ids).toContain(teammate.id);
    expect(ids).not.toContain(outsider.id);
  });
});
