import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { Prisma } from "../../../generated/prisma/client";
import {
  extractScriptSources,
  extractUpzeroCartActionIds,
  extractUpzeroStorefrontStoreId,
} from "@/lib/upzero-discovery";

const fetchMock = vi.fn();

const ACTION_ID = "ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12";

async function seedUpzeroStore(settings: Record<string, unknown>) {
  const { store } = await createStore();
  const integration = await prisma.integration.create({
    data: {
      store_id: store.id,
      provider: "upzero",
      status: "active",
      credentials: {},
      settings: settings as Prisma.InputJsonValue,
      external_store_id: `upzero:${store.id}`,
      connected_at: new Date(),
    },
  });
  return { store, integration };
}

describe("upzero cart-context discovery", () => {
  describe("extractors (unit)", () => {
    it("finds server-action ids near cart markers", () => {
      const chunk = `createServerReference("${ACTION_ID}",callServer,void 0,findSourceMapURL,"addStorefrontCartItemsBatchAction")`;
      expect(extractUpzeroCartActionIds(chunk)).toEqual([ACTION_ID]);
    });

    it("finds the storefront store id in __NEXT_DATA__", () => {
      const html = `<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"store":{"id":4821}}}}</script>`;
      expect(extractUpzeroStorefrontStoreId(html)).toBe(4821);
    });

    it("resolves script srcs against the page url", () => {
      const html = `<script src="/_next/static/chunks/app.js"></script>`;
      expect(extractScriptSources(html, "https://loja.example.com/produtos/x")).toEqual([
        "https://loja.example.com/_next/static/chunks/app.js",
      ]);
    });
  });

  describe("POST /api/widget/upzero-proxy discover_cart_context (e2e)", () => {
    beforeAll(async () => {
      await app.ready();
      vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
      fetchMock.mockReset();
    });

    afterAll(async () => {
      vi.unstubAllGlobals();
      await app.close();
    });

    it("returns the cached context without fetching the storefront", async () => {
      const { store } = await seedUpzeroStore({
        storefront_url: "https://loja.example.com",
        cart_action_ids: [ACTION_ID],
        storefront_store_id: 4821,
      });

      const response = await request(app.server)
        .post("/api/widget/upzero-proxy")
        .send({ action: "discover_cart_context", store_id: store.id });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        cached: true,
        cart_action_ids: [ACTION_ID],
        storefront_store_id: 4821,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("scrapes the pinned storefront origin and persists the discovery", async () => {
      const { store, integration } = await seedUpzeroStore({
        storefront_url: "https://loja.example.com",
      });

      fetchMock.mockImplementation(async (url: string) => {
        if (String(url) === "https://loja.example.com/produtos/tenis") {
          return new Response(
            `<script id="__NEXT_DATA__" type="application/json">{"store":{"id":4821}}</script>` +
              `<script src="/_next/static/chunks/cart.js"></script>`,
            { status: 200 },
          );
        }
        if (String(url).includes("/_next/static/chunks/cart.js")) {
          return new Response(
            `createServerReference("${ACTION_ID}",cb,void 0,src,"addStorefrontCartItemsBatchAction")`,
            { status: 200 },
          );
        }
        return new Response("", { status: 404 });
      });

      const response = await request(app.server)
        .post("/api/widget/upzero-proxy")
        .send({
          action: "discover_cart_context",
          store_id: store.id,
          // Attempted host override must be ignored — only the path is used.
          product_path: "/produtos/tenis",
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        cached: false,
        cart_action_ids: [ACTION_ID],
        storefront_store_id: 4821,
      });
      for (const [url] of fetchMock.mock.calls) {
        expect(String(url).startsWith("https://loja.example.com/")).toBe(true);
      }

      const persisted = await prisma.integration.findUnique({
        where: { id: integration.id },
        select: { settings: true },
      });
      const settings = persisted?.settings as Record<string, unknown>;
      expect(settings.cart_action_ids).toEqual([ACTION_ID]);
      expect(settings.storefront_store_id).toBe(4821);
      expect(settings.storefront_store_id_source).toBe("public_storefront");
    });

    it("rejects discovery when no storefront url is on record", async () => {
      const { store } = await seedUpzeroStore({});

      const response = await request(app.server)
        .post("/api/widget/upzero-proxy")
        .send({ action: "discover_cart_context", store_id: store.id });

      expect(response.status).toBe(424);
      expect(response.body).toEqual({ error: "upzero_storefront_url_missing" });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
