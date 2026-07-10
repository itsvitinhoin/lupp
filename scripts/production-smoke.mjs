#!/usr/bin/env node

const baseUrl = (process.env.LUPP_SMOKE_BASE_URL || "https://www.playluup.com.br")
  .replace(/\/$/, "");

const checks = [
  {
    name: "landing",
    url: `${baseUrl}/`,
    expect: (response, body) =>
      response.ok && /Luup|Video Commerce|E-Commerce/i.test(body),
  },
  {
    name: "widget",
    url: `${baseUrl}/widget.js`,
    expect: (response, body) =>
      response.ok &&
      /lupp-widget-bootstrap|floating_launcher|upzero-storefront-proxy/i.test(body),
  },
];

async function runCheck(check) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(check.url, {
      cache: "no-store",
      headers: { "User-Agent": "luup-production-smoke/1.0" },
      signal: controller.signal,
    });
    const body = await response.text();
    if (!check.expect(response, body)) {
      throw new Error(`unexpected response ${response.status}`);
    }
    console.log(`ok ${check.name} ${response.status}`);
  } finally {
    clearTimeout(timeout);
  }
}

const failures = [];
for (const check of checks) {
  try {
    await runCheck(check);
  } catch (error) {
    failures.push(`${check.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length) {
  console.error("Production smoke failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Production smoke passed.");
