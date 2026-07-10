#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const findings = [];

const integrationFiles = {
  upzero: [
    "supabase/functions/upzero-connect/index.ts",
    "supabase/functions/upzero-sync-products/index.ts",
    "supabase/functions/upzero-storefront-proxy/index.ts",
  ],
  nuvemshop: [
    "supabase/functions/nuvemshop-oauth-start/index.ts",
    "supabase/functions/nuvemshop-oauth-callback/index.ts",
    "supabase/functions/nuvemshop-sync-products/index.ts",
    "supabase/functions/nuvemshop-install-script/index.ts",
    "supabase/functions/nuvemshop-lgpd-webhooks/index.ts",
  ],
  shopify: [
    "supabase/functions/shopify-oauth-start/index.ts",
    "supabase/functions/shopify-oauth-callback/index.ts",
    "supabase/functions/shopify-sync-products/index.ts",
    "supabase/functions/shopify-connect-custom-app/index.ts",
    "supabase/functions/shopify-compliance-webhooks/index.ts",
    "supabase/functions/shopify-embedded-session/index.ts",
    "supabase/functions/shopify-session-token-ping/index.ts",
  ],
  bunny: [
    "supabase/functions/bunny-upload-video/index.ts",
    "supabase/functions/bunny-video-status/index.ts",
    "supabase/functions/bunny-delete-video/index.ts",
  ],
  asaas: [
    "supabase/functions/asaas-create-subscription/index.ts",
    "supabase/functions/asaas-change-plan/index.ts",
    "supabase/functions/asaas-cancel-subscription/index.ts",
    "supabase/functions/asaas-webhook/index.ts",
  ],
};

const browserArtifacts = [
  "artifacts/lupp/public/widget.js",
  "artifacts/lupp/public/nuvemshop-script.js",
  "artifacts/lupp/public/nuvemshop-nubesdk.js",
  "artifacts/lupp/public/nuvemshop-cart-bridge.js",
  "artifacts/lupp/public/nuvemshop-loader.js",
];

const browserForbidden = [
  {
    pattern: /data-supabase-key/i,
    message: "Browser install snippets must not expose Supabase keys.",
  },
  {
    pattern: /\bintegration_secrets\b/i,
    message: "Browser artifacts must not read integration_secrets.",
  },
  {
    pattern: /\bservice_role\b/i,
    message: "Browser artifacts must not mention service-role access.",
  },
  {
    pattern: /\bSUPABASE_SERVICE_ROLE_KEY\b/i,
    message: "Browser artifacts must not reference service-role env vars.",
  },
  {
    pattern: /\bUPZERO_(?:STOREFRONT_)?API_KEY\b/i,
    message: "UP Zero keys must stay server-side.",
  },
  {
    pattern: /\bupzero_storefront_key\b/i,
    message: "UP Zero storefront keys must not be returned to the browser.",
  },
  {
    pattern: /\bX-API-Key\b/i,
    message: "Provider API headers must not be assembled in browser files.",
  },
  {
    pattern: /\bBUNNY_(?:STREAM_)?API_KEY\b/i,
    message: "Bunny API keys must stay server-side.",
  },
  {
    pattern: /\bASAAS_API_KEY\b/i,
    message: "Asaas API keys must stay server-side.",
  },
  {
    pattern: /\bshpat_[A-Za-z0-9_]+/i,
    message: "Shopify Admin API tokens must never be committed.",
  },
  {
    pattern: /\$aact_[A-Za-z0-9_.-]+/i,
    message: "Asaas API tokens must never be committed.",
  },
];

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return existsSync(path.join(root, relativePath));
}

function fail(severity, file, message) {
  findings.push({ severity, file, message });
}

function assertFile(relativePath, label) {
  if (!exists(relativePath)) {
    fail("critical", relativePath, `${label} is missing.`);
    return false;
  }
  return true;
}

function assertContains(relativePath, pattern, message) {
  if (!assertFile(relativePath, relativePath)) return;
  const text = read(relativePath);
  if (!pattern.test(text)) fail("high", relativePath, message);
}

function assertNotContains(relativePath, pattern, message) {
  if (!assertFile(relativePath, relativePath)) return;
  const text = read(relativePath);
  if (pattern.test(text)) fail("critical", relativePath, message);
}

function auditRequiredFiles() {
  for (const [integration, files] of Object.entries(integrationFiles)) {
    for (const file of files) {
      assertFile(file, `${integration} integration file`);
    }
  }
}

function auditBrowserContracts() {
  for (const file of browserArtifacts) {
    if (!exists(file)) continue;
    for (const rule of browserForbidden) {
      assertNotContains(file, rule.pattern, rule.message);
    }
  }

  assertContains(
    "artifacts/lupp/public/widget.js",
    /lupp-widget-bootstrap/,
    "The public widget must bootstrap through the Luup Edge Function.",
  );
  assertContains(
    "artifacts/lupp/public/widget.js",
    /upzero-storefront-proxy/,
    "UP Zero storefront calls must go through the Luup proxy.",
  );
  assertNotContains(
    "artifacts/lupp/public/widget.js",
    /\/rest\/v1/i,
    "The widget must not call Supabase REST directly from the browser.",
  );
}

function auditUpzeroContract() {
  const proxy = "supabase/functions/upzero-storefront-proxy/index.ts";
  assertContains(
    proxy,
    /integration_secrets/,
    "UP Zero proxy must load provider credentials server-side.",
  );
  assertContains(
    proxy,
    /X-API-Key/,
    "UP Zero proxy must assemble the provider API header server-side.",
  );
  assertContains(
    proxy,
    /hostAllowed|requestHostname/,
    "UP Zero proxy must validate request origin before proxying storefront calls.",
  );
  assertContains(
    proxy,
    /customer_status/,
    "UP Zero proxy must keep the login/price-visibility status route.",
  );
  assertContains(
    proxy,
    /cart_batch/,
    "UP Zero proxy must keep the cart batch route for quick order.",
  );
}

function auditBootstrapContract() {
  const bootstrap = "supabase/functions/lupp-widget-bootstrap/index.ts";
  assertNotContains(
    bootstrap,
    /upzero_storefront_key|data-supabase-key/i,
    "Widget bootstrap must not return provider or Supabase secrets.",
  );
  assertContains(
    bootstrap,
    /public_settings|stores|widgets|videos/s,
    "Widget bootstrap should remain the public runtime configuration boundary.",
  );
  assertContains(
    bootstrap,
    /plan_widget_limit/,
    "Horizontal widgets must keep server-side plan enforcement.",
  );
}

function auditWidgetDefaults() {
  assertContains(
    "artifacts/lupp/src/services/stores.service.ts",
    /withDefaultFloatingWidgetSettings/,
    "New stores must seed both floating and horizontal widget settings.",
  );
  assertContains(
    "supabase/functions/shopify-oauth-callback/index.ts",
    /carousel:\s*\{[\s\S]*enabled:\s*true/,
    "Shopify-created stores must seed horizontal widget settings.",
  );

  const migrations = "supabase/migrations";
  const normalizationMigration = existsSync(path.join(root, migrations))
    ? readFileSync(
        path.join(
          root,
          migrations,
          "20260710172527_normalize_carousel_defaults_and_upzero_platform.sql",
        ),
        "utf8",
      )
    : "";
  if (!/normalize_floating_widget_settings/.test(normalizationMigration)) {
    fail(
      "high",
      "supabase/migrations/20260710172527_normalize_carousel_defaults_and_upzero_platform.sql",
      "Database writes must normalize missing floating/carousel defaults.",
    );
  }
  if (!/stores\.slug = 'lipcem'[\s\S]*provider = 'upzero'/.test(normalizationMigration)) {
    fail(
      "high",
      "supabase/migrations/20260710172527_normalize_carousel_defaults_and_upzero_platform.sql",
      "Lipcem must only be reclassified when an active UP Zero integration exists.",
    );
  }
}

function auditCatalogSyncContracts() {
  const syncFiles = [
    "supabase/functions/upzero-sync-products/index.ts",
    "supabase/functions/nuvemshop-sync-products/index.ts",
    "supabase/functions/shopify-sync-products/index.ts",
  ];

  for (const file of syncFiles) {
    assertContains(
      file,
      /product_variants|variants/i,
      "Catalog sync must preserve product variants for cart and PDP matching.",
    );
  }
}

function auditBillingAndWebhookContracts() {
  assertContains(
    "supabase/functions/asaas-webhook/index.ts",
    /ASAAS_WEBHOOK_TOKEN/,
    "Asaas webhook must require an authentication token before processing events.",
  );
  assertContains(
    "supabase/functions/asaas-change-plan/index.ts",
    /subscription|plan/i,
    "Plan changes must stay centralized in the Asaas change-plan function.",
  );
}

function auditShopifyComplianceContracts() {
  assertContains(
    "supabase/functions/shopify-compliance-webhooks/index.ts",
    /customers\/data_request|customers\/redact|shop\/redact/,
    "Shopify compliance webhooks must include all required privacy topics.",
  );
  assertContains(
    "supabase/functions/shopify-embedded-session/index.ts",
    /session|token|shop/i,
    "Shopify embedded apps must keep a session-token boundary.",
  );
}

auditRequiredFiles();
auditBrowserContracts();
auditUpzeroContract();
auditBootstrapContract();
auditWidgetDefaults();
auditCatalogSyncContracts();
auditBillingAndWebhookContracts();
auditShopifyComplianceContracts();

if (findings.length > 0) {
  console.error("Integration audit failed:");
  for (const finding of findings) {
    console.error(
      `- [${finding.severity}] ${finding.file}: ${finding.message}`,
    );
  }
  process.exit(1);
}

console.log("Integration audit passed.");
