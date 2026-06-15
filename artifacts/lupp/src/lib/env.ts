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

const read = (key: string) => String(import.meta.env[key] ?? "").trim();

export const env: PublicEnv = {
  supabaseUrl: read("VITE_SUPABASE_URL"),
  supabaseAnonKey: read("VITE_SUPABASE_ANON_KEY"),
  appUrl: read("VITE_APP_URL") || window.location.origin,
  widgetCdnUrl: read("VITE_WIDGET_CDN_URL") || `${window.location.origin}/widget.js`,
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
