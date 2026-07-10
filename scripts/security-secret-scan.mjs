#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const ignoredDirs = new Set([
  ".git",
  ".vercel",
  ".local",
  "node_modules",
  "dist",
  "build",
  "coverage",
]);

const allowedServerFiles = [
  "docs/auditoria-tecnica-inicial.md",
  "scripts/integration-audit.mjs",
  "scripts/security-secret-scan.mjs",
  "supabase/functions/upzero-storefront-proxy/index.ts",
  "supabase/functions/upzero-connect/index.ts",
  "supabase/functions/upzero-sync-products/index.ts",
];

const findings = [];

const rules = [
  {
    id: "upzero-key-in-browser-contract",
    pattern:
      /data-upzero-storefront-key|upzero_storefront_key|UPZERO_STOREFRONT_API_KEY|UPZERO_API_KEY/g,
    severity: "critical",
    message:
      "UP Zero API keys must not be accepted, returned, or documented for browser/runtime snippets.",
  },
  {
    id: "supabase-key-in-install-snippet",
    pattern: /data-supabase-key\s*=/g,
    severity: "high",
    message:
      "Installation snippets must not ask merchants to paste Supabase keys.",
  },
  {
    id: "public-bunny-secret-env",
    pattern: /VITE_(BUNNY_API_KEY|CLOUDFLARE_STREAM_TOKEN)/g,
    severity: "high",
    message:
      "Provider API tokens must not use VITE_ because Vite exposes them to the browser bundle.",
  },
  {
    id: "supabase-service-role-literal",
    pattern: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*["']?eyJ/g,
    severity: "critical",
    message:
      "Never commit a Supabase service role JWT literal. Store it only as a secret.",
  },
  {
    id: "shopify-access-token-literal",
    pattern: /shpat_[A-Za-z0-9_]+/g,
    severity: "critical",
    message:
      "Never commit Shopify Admin API access tokens. Store them only as encrypted secrets.",
  },
  {
    id: "asaas-api-key-literal",
    pattern: /\$aact_[A-Za-z0-9_.-]+/g,
    severity: "critical",
    message:
      "Never commit Asaas API keys. Store them only as encrypted secrets.",
  },
];

function isTextFile(filePath) {
  return /\.(cjs|css|env|html|js|json|jsx|mjs|md|sql|ts|tsx|toml|txt|yml|yaml)$/i.test(
    filePath,
  );
}

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    if (ignoredDirs.has(entry)) continue;
    const absolute = path.join(directory, entry);
    const relative = path.relative(root, absolute);
    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      walk(absolute);
      continue;
    }
    if (!stats.isFile() || !isTextFile(relative)) continue;
    scanFile(relative, absolute);
  }
}

function scanFile(relative, absolute) {
  if (allowedServerFiles.includes(relative)) return;
  const text = readFileSync(absolute, "utf8");
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    let match;
    while ((match = rule.pattern.exec(text))) {
      const before = text.slice(0, match.index);
      const line = before.split(/\r?\n/).length;
      findings.push({
        ...rule,
        file: relative,
        line,
        match: match[0],
      });
    }
  }
}

walk(root);

if (findings.length) {
  console.error("Security secret scan failed:");
  for (const finding of findings) {
    console.error(
      `- [${finding.severity}] ${finding.id} at ${finding.file}:${finding.line} (${finding.match})`,
    );
    console.error(`  ${finding.message}`);
  }
  process.exit(1);
}

console.log("Security secret scan passed.");
