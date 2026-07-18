import { prisma } from "@/lib/prisma";
import { Prisma } from "../../../generated/prisma/client";

export { clean } from "@/lib/text";
import { clean } from "@/lib/text";

export function normalizedDomain(value: unknown) {
  const text = clean(value).toLowerCase();
  if (!text) return "";
  try {
    return new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`).hostname.replace(
      /^www\./,
      "",
    );
  } catch {
    return text
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .split("?")[0]
      .trim();
  }
}

function domainsMatch(left: string, right: string) {
  if (!left || !right) return false;
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

function integrationSettingsDomains(settings: unknown) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return [] as string[];
  }
  const record = settings as Record<string, unknown>;
  const candidates: unknown[] = [
    record.storefront_domain,
    record.nuvemshop_original_domain,
    record.store_domain,
    record.storefront_url,
  ];
  if (Array.isArray(record.nuvemshop_domains)) {
    candidates.push(...record.nuvemshop_domains);
  }
  if (Array.isArray(record.storefront_domains)) {
    candidates.push(...record.storefront_domains);
  }
  return candidates.map(normalizedDomain).filter(Boolean);
}

/** Columns the public widget bootstrap exposes about a store. */
const STORE_SELECT = {
  id: true,
  slug: true,
  button_color: true,
  status: true,
  platform: true,
  url: true,
  plan_id: true,
} satisfies Prisma.StoreSelect;

export type WidgetStore = Prisma.StoreGetPayload<{ select: typeof STORE_SELECT }>;

async function activeStoreById(storeId: string) {
  return prisma.store.findFirst({
    where: { id: storeId, status: "active" },
    select: STORE_SELECT,
  });
}

// "shop.example.com" also matches an indexed "example.com" (the old scan's
// suffix semantics), so look up the hostname plus every parent domain down
// to the registrable-ish two labels.
function parentDomainCandidates(domain: string) {
  const parts = domain.split(".").filter(Boolean);
  const candidates: string[] = [];
  for (let start = 0; start <= parts.length - 2; start += 1) {
    candidates.push(parts.slice(start).join("."));
  }
  return candidates.length ? candidates : [domain];
}

async function storeFromDomainIndex(storeDomain: string) {
  const rows = await prisma.storeDomain.findMany({
    where: { domain: { in: parentDomainCandidates(storeDomain) } },
    select: { domain: true, store_id: true },
  });
  if (!rows.length) return null;
  rows.sort((left, right) => right.domain.length - left.domain.length);

  // One fetch for every candidate, longest-domain match wins.
  const stores = await prisma.store.findMany({
    where: { id: { in: rows.map((row) => row.store_id) }, status: "active" },
    select: STORE_SELECT,
  });
  const storesById = new Map(stores.map((store) => [store.id, store]));
  for (const row of rows) {
    const store = storesById.get(row.store_id);
    if (store) return store;
  }
  return null;
}

// Best-effort self-heal: when only the legacy scan matched, persist the
// queried domain so the next request is a single indexed read. Also repoints
// stale mappings (e.g. a domain that moved to another store).
async function persistDomainMapping(domain: string, storeId: string, source: string) {
  try {
    await prisma.storeDomain.upsert({
      where: { domain },
      create: { domain, store_id: storeId, source },
      update: { store_id: storeId, source },
    });
  } catch {
    // The resolution itself already succeeded; never fail it on a cache write.
  }
}

export type StoreResolutionQuery = {
  store_id?: string;
  lupp_store_id?: string;
  store_slug?: string;
  lupp_store?: string;
  external_store_id?: string;
  store?: string;
  provider?: string;
  store_domain?: string;
  lupp_store_domain?: string;
  domain?: string;
  hostname?: string;
};

export type StoreResolution = {
  resolvedBy: string | null;
  store: WidgetStore | null;
  tried: string[];
};

// Resolution is a fallback chain: a stronger identifier that misses must not
// prevent a weaker one from matching (e.g. an inferred external_store_id that
// is stale should still fall through to domain matching).
export async function findStore(query: StoreResolutionQuery): Promise<StoreResolution> {
  const storeId = clean(query.store_id || query.lupp_store_id);
  const storeSlug = clean(query.store_slug || query.lupp_store);
  const externalStoreId = clean(query.external_store_id || query.store);
  const provider = clean(query.provider) || "nuvemshop";
  const storeDomain = normalizedDomain(
    query.store_domain || query.lupp_store_domain || query.domain || query.hostname || "",
  );

  const tried: string[] = [];

  if (storeId) {
    tried.push("store_id");
    const store = await activeStoreById(storeId);
    if (store) return { resolvedBy: "store_id", store, tried };
  }

  if (externalStoreId) {
    tried.push("external_store_id");
    const integration = await prisma.integration.findFirst({
      where: { provider, external_store_id: externalStoreId, status: "active" },
      select: { store_id: true },
    });
    if (integration?.store_id) {
      const store = await activeStoreById(integration.store_id);
      if (store) return { resolvedBy: "external_store_id", store, tried };
    }
  }

  if (storeSlug) {
    tried.push("store_slug");
    const store = await prisma.store.findFirst({
      where: { slug: storeSlug, status: "active" },
      select: STORE_SELECT,
    });
    if (store) return { resolvedBy: "store_slug", store, tried };
  }

  if (storeDomain) {
    tried.push("store_domain");

    // Fast path: indexed store_domains lookup (backfilled from stores.url,
    // self-healed below). The legacy scans only run when the index misses.
    const indexed = await storeFromDomainIndex(storeDomain);
    if (indexed) return { resolvedBy: "store_domain", store: indexed, tried };

    const stores = await prisma.store.findMany({
      where: { status: "active" },
      select: STORE_SELECT,
      take: 250,
    });

    const matched = stores.find((store) =>
      domainsMatch(normalizedDomain(store.url), storeDomain),
    );
    if (matched) {
      await persistDomainMapping(storeDomain, matched.id, "stores_url_scan");
      return { resolvedBy: "store_domain", store: matched, tried };
    }

    // Stores are often visited on a domain that differs from stores.url
    // (e.g. *.lojavirtualnuvem.com.br vs the custom domain). The OAuth
    // callback and product sync persist every known storefront domain in
    // integrations.settings, so match against those too.
    tried.push("integration_domain");
    const integrations = await prisma.integration.findMany({
      where: { status: "active" },
      select: { store_id: true, settings: true },
      take: 500,
    });

    const matchedIntegration = integrations.find((integration) =>
      integrationSettingsDomains(integration.settings).some((domain) =>
        domainsMatch(domain, storeDomain),
      ),
    );
    if (matchedIntegration?.store_id) {
      const store = await activeStoreById(matchedIntegration.store_id);
      if (store) {
        await persistDomainMapping(storeDomain, store.id, "integration_scan");
        return { resolvedBy: "integration_domain", store, tried };
      }
    }
  }

  return { resolvedBy: null, store: null, tried };
}
