export interface PublicEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  appUrl: string;
  widgetCdnUrl: string;
  videoProvider: "supabase" | "bunny" | "cloudflare";
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
  VITE_SUPABASE_URL: "https://duktrvqfbvpfajuajhci.supabase.co",
  VITE_SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1a3RydnFmYnZwZmFqdWFqaGNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MzkxMTUsImV4cCI6MjA5NzExNTExNX0.YIknu3rVb8BkRFENdf0PMTqqgLvOYGHslj5mcPBncNE",
  VITE_VIDEO_PROVIDER: "bunny",
};

function normalizeEnvValue(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "undefined" || normalized === "null") return "";
  return normalized;
}

const viteEnv: Record<string, unknown> = {
  VITE_APP_URL: import.meta.env.VITE_APP_URL,
  VITE_BUNNY_CDN_HOSTNAME: import.meta.env.VITE_BUNNY_CDN_HOSTNAME,
  VITE_BUNNY_LIBRARY_ID: import.meta.env.VITE_BUNNY_LIBRARY_ID,
  VITE_CLOUDFLARE_ACCOUNT_ID: import.meta.env.VITE_CLOUDFLARE_ACCOUNT_ID,
  VITE_GA4_MEASUREMENT_ID: import.meta.env.VITE_GA4_MEASUREMENT_ID,
  VITE_MERCADOPAGO_PUBLIC_KEY: import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY,
  VITE_META_PIXEL_ID: import.meta.env.VITE_META_PIXEL_ID,
  VITE_STRIPE_PUBLIC_KEY: import.meta.env.VITE_STRIPE_PUBLIC_KEY,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
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

  return "https://www.playluup.com.br/widget.js";
}

function resolveAppUrl() {
  const configuredUrl = read("VITE_APP_URL");
  const isHttpsApp = window.location.protocol === "https:";
  const pointsToLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/?$/i.test(configuredUrl);

  if (configuredUrl && !(isHttpsApp && pointsToLocalhost)) return configuredUrl.replace(/\/$/, "");
  return window.location.origin;
}

export const env: PublicEnv = {
  supabaseUrl: read("VITE_SUPABASE_URL"),
  supabaseAnonKey: read("VITE_SUPABASE_ANON_KEY"),
  appUrl: resolveAppUrl(),
  widgetCdnUrl: resolveWidgetCdnUrl(),
  videoProvider: (read("VITE_VIDEO_PROVIDER") || "supabase") as PublicEnv["videoProvider"],
  bunnyLibraryId: read("VITE_BUNNY_LIBRARY_ID"),
  bunnyCdnHostname: read("VITE_BUNNY_CDN_HOSTNAME"),
  cloudflareAccountId: read("VITE_CLOUDFLARE_ACCOUNT_ID"),
  stripePublicKey: read("VITE_STRIPE_PUBLIC_KEY"),
  mercadoPagoPublicKey: read("VITE_MERCADOPAGO_PUBLIC_KEY"),
  ga4MeasurementId: read("VITE_GA4_MEASUREMENT_ID"),
  metaPixelId: read("VITE_META_PIXEL_ID"),
  tiktokPixelId: read("VITE_TIKTOK_PIXEL_ID"),
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

export function getMissingRequiredEnv() {
  const missing: string[] = [];
  if (!env.supabaseUrl) missing.push("VITE_SUPABASE_URL");
  if (!env.supabaseAnonKey) missing.push("VITE_SUPABASE_ANON_KEY");
  return missing;
}
