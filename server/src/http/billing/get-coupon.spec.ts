import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createUser } from "../../../test/utils/create-user";

describe("GET /api/billing/coupons/:code (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("finds an active coupon case-insensitively", async () => {
    const user = await createUser();
    const token = app.jwt.sign({ sub: user.id, role: "agent" });
    await prisma.discountCoupon.create({
      data: { code: "BEMVINDO10", percent_off: 10, is_active: true },
    });

    const response = await request(app.server)
      .get("/api/billing/coupons/bemvindo10")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.coupon).toMatchObject({ code: "BEMVINDO10", percent_off: 10 });
  });

  it("returns null for inactive or unknown codes", async () => {
    const user = await createUser();
    const token = app.jwt.sign({ sub: user.id, role: "agent" });
    await prisma.discountCoupon.create({
      data: { code: "DESATIVADO", percent_off: 5, is_active: false },
    });

    const inactive = await request(app.server)
      .get("/api/billing/coupons/DESATIVADO")
      .set("Authorization", `Bearer ${token}`);
    expect(inactive.body.coupon).toBeNull();

    const unknown = await request(app.server)
      .get("/api/billing/coupons/NAOEXISTE")
      .set("Authorization", `Bearer ${token}`);
    expect(unknown.body.coupon).toBeNull();
  });
});
