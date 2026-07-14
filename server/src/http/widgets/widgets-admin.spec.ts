import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";

describe("widgets admin (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("lists a store's widgets oldest first", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    await prisma.widget.createMany({
      data: [
        { store_id: store.id, name: "A", type: "floating_video", status: "active" },
        { store_id: store.id, name: "B", type: "stories_bar", status: "inactive" },
      ],
    });

    const response = await request(app.server)
      .get("/api/widgets")
      .query({ store_id: store.id })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.widgets.map((w: any) => w.name)).toEqual(["A", "B"]);
  });

  it("updates a widget and rejects cross-store members", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const widget = await prisma.widget.create({
      data: { store_id: store.id, name: "Config", type: "floating_video" },
    });

    const response = await request(app.server)
      .patch(`/api/widgets/${widget.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "active", settings: { display: { mode: "product" } } });

    expect(response.status).toBe(200);
    expect(response.body.widget.status).toBe("active");
    expect(response.body.widget.settings.display.mode).toBe("product");

    const outsider = await createUser();
    const outsiderToken = app.jwt.sign({ sub: outsider.id, role: "agent" });
    const denied = await request(app.server)
      .patch(`/api/widgets/${widget.id}`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({ status: "inactive" });
    expect(denied.status).toBe(403);
  });

  it("ensure-floating creates the widget with normalized settings", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/widgets/floating/ensure")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(200);
    expect(response.body.widget).toMatchObject({ type: "floating_video", status: "active" });
    expect(response.body.widget.settings.display.mode).toBe("all");
    expect(response.body.widget.settings.carousel.enabled).toBe(true);
  });

  it("ensure-floating merge-updates while preserving custom keys", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    await prisma.widget.create({
      data: {
        store_id: store.id,
        name: "Floating Video",
        type: "floating_video",
        status: "inactive",
        settings: {
          appearance: { accent: "#123456" },
          display: { mode: "product", home_ordering: "automatic" },
          carousel: { title: "Personalizado" },
        },
      },
    });

    const response = await request(app.server)
      .post("/api/widgets/floating/ensure")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(200);
    const { settings } = response.body.widget;
    expect(response.body.widget.status).toBe("active");
    expect(settings.display.mode).toBe("all");
    expect(settings.display.home_ordering).toBe("automatic");
    expect(settings.appearance.accent).toBe("#123456");
    expect(settings.carousel.title).toBe("Personalizado");
    expect(settings.carousel.enabled).toBe(true);
  });
});
