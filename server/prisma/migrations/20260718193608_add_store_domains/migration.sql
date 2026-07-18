-- CreateTable
CREATE TABLE "store_domains" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'resolver',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_domains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_domains_domain_key" ON "store_domains"("domain");

-- CreateIndex
CREATE INDEX "store_domains_store_id_idx" ON "store_domains"("store_id");

-- AddForeignKey
ALTER TABLE "store_domains" ADD CONSTRAINT "store_domains_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: index every known stores.url hostname (www-stripped, no port or
-- path). Integration-settings domains self-heal at resolve time instead.
INSERT INTO "store_domains" ("id", "store_id", "domain", "source")
SELECT
    gen_random_uuid(),
    "id",
    split_part(split_part(regexp_replace(lower("url"), '^https?://(www\.)?', ''), '/', 1), ':', 1),
    'stores_url_backfill'
FROM "stores"
WHERE "url" IS NOT NULL
  AND split_part(split_part(regexp_replace(lower("url"), '^https?://(www\.)?', ''), '/', 1), ':', 1) <> ''
ON CONFLICT ("domain") DO NOTHING;
