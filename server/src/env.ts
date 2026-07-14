import "dotenv/config";
import { z } from "zod";

// Known placeholder default. It keeps local dev/test frictionless, but
// shipping it to production means signing tokens with a publicly-known
// secret — so it is rejected when NODE_ENV === "production".
const DEFAULT_JWT_SECRET = "lupp-server-jwt-secret";

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["dev", "test", "production"])
      .default("dev"),
    JWT_SECRET: z.string().default(DEFAULT_JWT_SECRET),
    PORT: z.coerce.number().default(3333),
    DATABASE_URL: z.url().default("postgres://docker:docker@localhost:5433/lupp"),
    // pg Pool sizing + per-statement timeout (ms) for the Prisma adapter
    // (src/lib/prisma.ts). The timeout bounds runaway scans so they can't pin
    // a pooled connection forever.
    DATABASE_POOL_MAX: z.coerce.number().default(10),
    DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().default(30_000),
    // Public base URL of the SPA (OAuth redirects, billing callback URLs).
    LUPP_APP_URL: z.url().default("http://localhost:5173"),
    // Public base URL of this API — email confirmation links point here.
    LUPP_API_URL: z.url().default("http://localhost:3333"),
    // MAILER (auth confirmation/reset emails). "log" prints messages to the
    // server log instead of sending; swap for a real driver in production.
    MAIL_DRIVER: z.enum(["log"]).default("log"),
    MAIL_FROM: z.string().default("Luup <no-reply@playluup.com.br>"),
    // Max sign-in attempts per IP per minute (the brute-force surface).
    RATE_LIMIT_LOGIN_MAX: z.coerce.number().default(10),
    // ASAAS BILLING (integration off when the API key is unset)
    ASAAS_API_KEY: z.string().optional(),
    ASAAS_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
    ASAAS_WEBHOOK_TOKEN: z.string().optional(),
    // BUNNY STREAM (video hosting/encoding; off when unset)
    BUNNY_STREAM_LIBRARY_ID: z.string().optional(),
    BUNNY_STREAM_API_KEY: z.string().optional(),
    BUNNY_STREAM_CDN_HOSTNAME: z.string().optional(),
    // BUNNY STORAGE ZONE (image assets: store logos, thumbnails; off when unset)
    BUNNY_STORAGE_ZONE_NAME: z.string().optional(),
    BUNNY_STORAGE_API_KEY: z.string().optional(),
    BUNNY_STORAGE_HOSTNAME: z.string().default("storage.bunnycdn.com"),
    BUNNY_STORAGE_CDN_HOSTNAME: z.string().optional(),
    // Max public writes (comments) per IP per minute.
    RATE_LIMIT_PUBLIC_WRITE_MAX: z.coerce.number().default(10),
    // NUVEMSHOP / TIENDANUBE
    NUVEMSHOP_APP_ID: z.string().default("34355"),
    NUVEMSHOP_CLIENT_ID: z.string().optional(),
    NUVEMSHOP_CLIENT_SECRET: z.string().optional(),
    NUVEMSHOP_STATE_SECRET: z.string().optional(),
    NUVEMSHOP_AUTHORIZE_BASE_URL: z.url().default("https://www.nuvemshop.com.br"),
    // SHOPIFY
    SHOPIFY_API_KEY: z.string().optional(),
    SHOPIFY_API_SECRET: z.string().optional(),
    SHOPIFY_SCOPES: z.string().default("read_products,read_inventory,read_locations"),
    SHOPIFY_REDIRECT_URI: z.url().optional(),
    SHOPIFY_STATE_SECRET: z.string().optional(),
    SHOPIFY_APP_URL: z.url().optional(),
    SHOPIFY_CUSTOM_APPS_JSON: z.string().optional(),
    SHOPIFY_API_VERSION: z.string().default("2026-04"),
    // UPZERO
    UPZERO_API_BASE_URL: z.url().default("https://api.upzero.com.br"),
    // MASTER CONSOLE (comma-separated admin email allowlist)
    MASTER_ADMIN_EMAILS: z.string().default("playluup@gmail.com"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;

    if (env.JWT_SECRET === DEFAULT_JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_SECRET"],
        message:
          "JWT_SECRET must be set to a real secret in production (the default placeholder is not allowed).",
      });
    }
  });

const localEnv = process.env ? process.env : {};

const _env = envSchema.safeParse(localEnv);

if (_env.success === false) {
  console.error("Invalid environment variables.", _env.error.format());

  throw new Error("Invalid environment variables.");
}

export const env = _env.data;
