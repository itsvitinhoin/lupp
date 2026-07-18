export interface PublicEnv {
  apiUrl: string;
  appUrl: string;
  widgetCdnUrl: string;
  videoProvider: "bunny";
  bunnyLibraryId: string;
  bunnyCdnHostname: string;
  cloudflareAccountId: string;
  stripePublicKey: string;
  mercadoPagoPublicKey: string;
  ga4MeasurementId: string;
  metaPixelId: string;
  tiktokPixelId: string;
}

const publicFallbackEnv: Record<string, string> = {
  VITE_BUNNY_CDN_HOSTNAME: "vz-11a4fb3b-4f0.b-cdn.net",
  VITE_BUNNY_LIBRARY_ID: "686560",
  VITE_VIDEO_PROVIDER: "bunny",
};

function normalizeEnvValue(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "undefined" || normalized === "null") return "";
  return normalized;
}

const viteEnv: Record<string, unknown> = {
  VITE_API_URL: import.meta.env.VITE_API_URL,
  VITE_APP_URL: import.meta.env.VITE_APP_URL,
  VITE_BUNNY_CDN_HOSTNAME: import.meta.env.VITE_BUNNY_CDN_HOSTNAME,
  VITE_BUNNY_LIBRARY_ID: import.meta.env.VITE_BUNNY_LIBRARY_ID,
  VITE_CLOUDFLARE_ACCOUNT_ID: import.meta.env.VITE_CLOUDFLARE_ACCOUNT_ID,
  VITE_GA4_MEASUREMENT_ID: import.meta.env.VITE_GA4_MEASUREMENT_ID,
  VITE_MERCADOPAGO_PUBLIC_KEY: import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY,
  VITE_META_PIXEL_ID: import.meta.env.VITE_META_PIXEL_ID,
  VITE_STRIPE_PUBLIC_KEY: import.meta.env.VITE_STRIPE_PUBLIC_KEY,
  VITE_TIKTOK_PIXEL_ID: import.meta.env.VITE_TIKTOK_PIXEL_ID,
  VITE_VIDEO_PROVIDER: import.meta.env.VITE_VIDEO_PROVIDER,
  VITE_WIDGET_CDN_URL: import.meta.env.VITE_WIDGET_CDN_URL,
};

const read = (key: string) => normalizeEnvValue(viteEnv[key]) || publicFallbackEnv[key] || "";

function resolveWidgetCdnUrl() {
  const configuredUrl = read("VITE_WIDGET_CDN_URL");
  const isHttpsApp = window.location.protocol === "https:";
  const pointsToLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//i.test(configuredUrl);
  const pointsToLegacyVercel =
    /^https:\/\/lupp-lupp\.vercel\.app\/widget\.js(?:\?.*)?$/i.test(configuredUrl);

  if (configuredUrl && !(isHttpsApp && pointsToLocalhost) && !pointsToLegacyVercel) {
    return configuredUrl;
  }

  if (/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(window.location.hostname)) {
    return `${window.location.origin}/widget.js`;
  }

  return "https://luup.dzns.com.br/widget.js";
}

function resolveApiUrl() {
  const configuredUrl = read("VITE_API_URL");
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");

  if (/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(window.location.hostname)) {
    return "http://localhost:3333";
  }

  return "https://luup.dzns.net";
}

function resolveAppUrl() {
  const configuredUrl = read("VITE_APP_URL");
  const isHttpsApp = window.location.protocol === "https:";
  const pointsToLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/?$/i.test(configuredUrl);

  if (configuredUrl && !(isHttpsApp && pointsToLocalhost)) return configuredUrl.replace(/\/$/, "");
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(window.location.hostname)) {
    return window.location.origin;
  }
  return "https://luup.dzns.com.br";
}

export const env: PublicEnv = {
  apiUrl: resolveApiUrl(),
  appUrl: resolveAppUrl(),
  widgetCdnUrl: resolveWidgetCdnUrl(),
  videoProvider: "bunny",
  bunnyLibraryId: read("VITE_BUNNY_LIBRARY_ID"),
  bunnyCdnHostname: read("VITE_BUNNY_CDN_HOSTNAME"),
  cloudflareAccountId: read("VITE_CLOUDFLARE_ACCOUNT_ID"),
  stripePublicKey: read("VITE_STRIPE_PUBLIC_KEY"),
  mercadoPagoPublicKey: read("VITE_MERCADOPAGO_PUBLIC_KEY"),
  ga4MeasurementId: read("VITE_GA4_MEASUREMENT_ID"),
  metaPixelId: read("VITE_META_PIXEL_ID"),
  tiktokPixelId: read("VITE_TIKTOK_PIXEL_ID"),
};

// The API base resolves to localhost:3333 on localhost, so dev is always on;
// production needs VITE_API_URL.
export const isApiConfigured = Boolean(env.apiUrl);

export function getMissingRequiredEnv() {
  const missing: string[] = [];
  if (!env.apiUrl) missing.push("VITE_API_URL");
  return missing;
}
