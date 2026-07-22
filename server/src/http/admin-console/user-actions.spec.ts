import { readFileSync } from "node:fs";
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

describe("POST /api/admin-console — platform user actions (e2e)", () => {
  let adminToken: string;
  let adminId: string;

  beforeAll(async () => {
    if (!routesWired) await app.register(AdminConsoleRoutes);
    await app.ready();
    const admin = await createUser({ role: "admin" });
    adminId = admin.id;
    adminToken = app.jwt.sign({ sub: admin.id, role: "admin" });
  });

  afterAll(async () => {
    await app.close();
  });

  it("set_user_role changes the platform role and writes an audit log", async () => {
    const target = await createUser({ role: "agent" });

    const response = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "set_user_role", user_id: target.id, role: "manager" });

    expect(response.status).toBe(200);
    expect(response.body.result.user).toEqual({ id: target.id, role: "manager" });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.role).toBe("manager");

    const audit = await prisma.adminConsoleAuditLog.findFirst({
      where: { action: "set_user_role", admin_user_id: adminId },
    });
    expect(audit).not.toBeNull();
    expect(audit?.target_store_id).toBeNull();
  });

  it("set_user_role rejects an invalid role and changing the caller's own role", async () => {
    const target = await createUser();

    const invalidRole = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "set_user_role", user_id: target.id, role: "superuser" });
    expect(invalidRole.status).toBe(400);
    expect(invalidRole.body).toEqual({ error: "invalid_role" });

    const selfChange = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "set_user_role", user_id: adminId, role: "manager" });
    expect(selfChange.status).toBe(400);
    expect(selfChange.body).toEqual({ error: "cannot_change_own_role" });
  });

  it("set_user_email_confirmed sets and clears email_confirmed_at", async () => {
    const target = await createUser({ email_confirmed_at: null });

    const confirmed = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "set_user_email_confirmed", user_id: target.id, confirmed: true });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.result.user.email_confirmed_at).not.toBeNull();

    let updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.email_confirmed_at).not.toBeNull();

    const cleared = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "set_user_email_confirmed", user_id: target.id, confirmed: false });
    expect(cleared.status).toBe(200);
    expect(cleared.body.result.user.email_confirmed_at).toBeNull();

    updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.email_confirmed_at).toBeNull();
  });

  it("reset_user_password issues a working password and hides it from the audit log", async () => {
    const target = await createUser({ password: "old-secret-123" });

    const response = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "reset_user_password", user_id: target.id });

    expect(response.status).toBe(200);
    const newPassword: string = response.body.result.password;
    expect(typeof newPassword).toBe("string");
    expect(newPassword.length).toBeGreaterThanOrEqual(10);

    const oldPasswordLogin = await request(app.server)
      .post("/api/auth/sessions")
      .send({ email: target.email, password: "old-secret-123" });
    expect(oldPasswordLogin.status).toBe(401);

    const newPasswordLogin = await request(app.server)
      .post("/api/auth/sessions")
      .send({ email: target.email, password: newPassword });
    expect(newPasswordLogin.status).toBe(200);

    const audit = await prisma.adminConsoleAuditLog.findFirstOrThrow({
      where: { action: "reset_user_password", admin_user_id: adminId, payload: { path: ["user_id"], equals: target.id } },
    });
    expect(audit.result).not.toHaveProperty("password");
  });

  it("add_user_to_store adds a membership and rejects duplicates / unknown targets", async () => {
    const { store } = await createStore();
    const target = await createUser();

    const missingIds = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "add_user_to_store", user_id: target.id });
    expect(missingIds.status).toBe(400);
    expect(missingIds.body).toEqual({ error: "missing_target_store_id" });

    const added = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        action: "add_user_to_store",
        user_id: target.id,
        target_store_id: store.id,
        role: "editor",
      });
    expect(added.status).toBe(200);
    expect(added.body.result.member).toMatchObject({
      role: "editor",
      store: { id: store.id, name: store.name, slug: store.slug },
    });

    const membership = await prisma.storeMember.findUnique({
      where: { store_id_user_id: { store_id: store.id, user_id: target.id } },
    });
    expect(membership).not.toBeNull();
    expect(membership?.role).toBe("editor");

    const duplicate = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "add_user_to_store", user_id: target.id, target_store_id: store.id });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toEqual({ error: "already_member" });

    const unknownStore = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        action: "add_user_to_store",
        user_id: (await createUser()).id,
        target_store_id: "not-a-real-store",
      });
    expect(unknownStore.status).toBe(404);
    expect(unknownStore.body).toEqual({ error: "store_not_found" });
  });

  it("remove_user_from_store removes a membership and refuses to remove the owner", async () => {
    const { owner, store } = await createStore();
    const teammate = await createUser();
    await prisma.storeMember.create({
      data: { store_id: store.id, user_id: teammate.id, role: "editor" },
    });

    const ownerRemoval = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "remove_user_from_store", user_id: owner.id, target_store_id: store.id });
    expect(ownerRemoval.status).toBe(400);
    expect(ownerRemoval.body).toEqual({ error: "cannot_remove_owner" });

    const removed = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        action: "remove_user_from_store",
        user_id: teammate.id,
        target_store_id: store.id,
      });
    expect(removed.status).toBe(200);
    expect(
      await prisma.storeMember.findUnique({
        where: { store_id_user_id: { store_id: store.id, user_id: teammate.id } },
      }),
    ).toBeNull();

    const notAMember = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        action: "remove_user_from_store",
        user_id: teammate.id,
        target_store_id: store.id,
      });
    expect(notAMember.status).toBe(404);
    expect(notAMember.body).toEqual({ error: "member_not_found" });
  });
});
