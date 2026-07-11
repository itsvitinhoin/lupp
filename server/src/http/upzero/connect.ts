import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { findStoreMembership } from "@/lib/store-membership";
import {
  normalizeUpzeroBaseUrl,
  readUpzeroJson,
  upzeroApiHeaders,
  upzeroFetch,
} from "@/lib/upzero";
import { edgeErrorSchemas } from "@/schemas/http-errors";

// Ported from supabase/functions/upzero-connect. Field checks stay in the
// handler (not strict zod types) so the machine-readable error codes the SPA
// switches on ("missing_store_id", "missing_upzero_api_key") are preserved.
const BodySchema = z.object({
  store_id: z.string().optional().describe("Store to connect to Upzero."),
  apiKey: z.string().optional().describe("Upzero API key."),
  api_key: z.string().optional().describe("Upzero API key (snake_case alias)."),
  baseUrl: z.string().optional().describe("Upzero API base URL override."),
  base_url: z.string().optional(),
  integrationName: z
    .string()
    .optional()
    .describe("Partner integration name for /external endpoints."),
  integration_name: z.string().optional(),
  storefrontUrl: z
    .string()
    .optional()
    .describe("Public storefront URL (falls back to the store's url)."),
  storefront_url: z.string().optional(),
  productUrlPattern: z
    .string()
    .optional()
    .describe("Product URL pattern, default /produtos/{code}-{name_slug}."),
  product_url_pattern: z.string().optional(),
});

export const UpzeroConnectSchema = {
  schema: {
    summary: "Connect Upzero via API key",
    description:
      "Tests the provided Upzero API key against the storefront `/v1/products` endpoint and " +
      "then the partner `/external/v1/products` endpoint, persisting the integration, its " +
      "secret and the store's platform when either succeeds. Returns 401 when both attempts " +
      "were rejected as unauthorized and 502 when they failed for another reason.",
    tags: ["upzero"],
    operationId: "upzeroConnect",
    security: [{ bearerAuth: [] }],
    body: BodySchema,
    response: {
      200: z.object({
        ok: z.boolean(),
        products_previewed: z.number(),
        source: z.string(),
      }),
      ...edgeErrorSchemas,
      // Failed connection tests echo the upstream attempts alongside the code.
      401: z.union([
        z.object({ message: z.string() }),
        z.looseObject({ error: z.string() }),
      ]),
      502: z.looseObject({ error: z.string() }),
    },
  },
};

function previewCount(payload: Record<string, unknown> | unknown[]) {
  if (Array.isArray(payload)) return payload.length;
  if (Array.isArray(payload.items)) return payload.items.length;
  if (Array.isArray(payload.data)) return payload.data.length;
  return 0;
}

async function testUpzeroEndpoint(
  url: URL,
  apiKey: string,
  source: "storefront" | "external",
) {
  const response = await upzeroFetch(url, { headers: upzeroApiHeaders(apiKey) });
  const details = await readUpzeroJson(response);

  return {
    details,
    ok: response.ok,
    previewed: response.ok ? previewCount(details) : 0,
    source,
    status: response.status,
  };
}

export async function upzeroConnectHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const body = BodySchema.parse(request.body ?? {});
  const storeId = String(body.store_id || "").trim();
  const apiKey = String(body.apiKey || body.api_key || "").trim();
  const baseUrl = normalizeUpzeroBaseUrl(String(body.baseUrl || body.base_url || ""));
  const integrationName = String(
    body.integrationName || body.integration_name || "",
  ).trim();
  let storefrontUrl = String(body.storefrontUrl || body.storefront_url || "")
    .trim()
    .replace(/\/+$/, "");
  const productUrlPattern =
    String(
      body.productUrlPattern ||
        body.product_url_pattern ||
        "/produtos/{code}-{name_slug}",
    ).trim() || "/produtos/{code}-{name_slug}";

  if (!storeId) return reply.status(400).send({ error: "missing_store_id" });
  if (!apiKey) return reply.status(400).send({ error: "missing_upzero_api_key" });

  const member = await findStoreMembership(request.user.sub, storeId);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  if (!storefrontUrl) {
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { url: true },
    });
    storefrontUrl = String(store?.url || "")
      .trim()
      .replace(/\/+$/, "");
  }

  const testUrl = new URL(`${baseUrl}/v1/products`);
  testUrl.searchParams.set("limit", "1");
  testUrl.searchParams.set("card_mode", "true");
  testUrl.searchParams.set("include_variants", "false");

  const storefrontTest = await testUpzeroEndpoint(testUrl, apiKey, "storefront");
  let successfulTest = storefrontTest.ok ? storefrontTest : null;

  if (!successfulTest) {
    const externalTestUrl = new URL(`${baseUrl}/external/v1/products`);
    externalTestUrl.searchParams.set("limit", "1");
    if (integrationName)
      externalTestUrl.searchParams.set("integration", integrationName);
    const externalTest = await testUpzeroEndpoint(
      externalTestUrl,
      apiKey,
      "external",
    );
    successfulTest = externalTest.ok ? externalTest : null;

    if (!successfulTest) {
      return reply
        .status(
          storefrontTest.status === 401 && externalTest.status === 401
            ? 401
            : 502,
        )
        .send({
          attempts: [
            {
              details: storefrontTest.details,
              source: storefrontTest.source,
              status: storefrontTest.status,
            },
            {
              details: externalTest.details,
              source: externalTest.source,
              status: externalTest.status,
            },
          ],
          error: "upzero_connection_test_failed",
        });
    }
  }

  const externalStoreId = `upzero:${storeId}`;
  const now = new Date();
  const settings = {
    base_url: baseUrl,
    connected_via: "api_key",
    integration_name: integrationName || null,
    last_connection_source: successfulTest.source,
    last_connection_test_at: now.toISOString(),
    product_url_pattern: productUrlPattern,
    storefront_url: storefrontUrl || null,
  };

  let integrationId: string;
  try {
    const integration = await prisma.integration.upsert({
      where: { store_id_provider: { store_id: storeId, provider: "upzero" } },
      create: {
        connected_at: now,
        credentials: {},
        external_store_id: externalStoreId,
        provider: "upzero",
        settings,
        status: "active",
        store_id: storeId,
      },
      update: {
        connected_at: now,
        credentials: {},
        external_store_id: externalStoreId,
        settings,
        status: "active",
      },
    });
    integrationId = integration.id;
  } catch (error) {
    request.log.error(error, "upzero-connect: integration upsert failed");
    return reply.status(500).send({ error: "luup_integration_save_failed" });
  }

  try {
    const secret = {
      access_token: apiKey,
      external_store_id: externalStoreId,
      metadata: {
        base_url: baseUrl,
        integration_name: integrationName || null,
        source: successfulTest.source,
      },
      provider: "upzero",
      scope: "storefront:products external:products",
      token_type: "api_key",
    };
    await prisma.integrationSecret.upsert({
      where: { integration_id: integrationId },
      create: { integration_id: integrationId, ...secret },
      update: secret,
    });
  } catch (error) {
    request.log.error(error, "upzero-connect: secret upsert failed");
    return reply
      .status(500)
      .send({ error: "luup_integration_secret_save_failed" });
  }

  await prisma.store.update({
    where: { id: storeId },
    data: { platform: "upzero" },
  });

  return reply.status(200).send({
    ok: true,
    products_previewed: successfulTest.previewed,
    source: successfulTest.source,
  });
}
