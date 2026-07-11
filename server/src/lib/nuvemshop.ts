import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";

/**
 * Thin Nuvemshop/Tiendanube client + OAuth state helpers shared by the
 * routes ported from the nuvemshop-* edge functions. Hosts/versions match
 * the originals: store/product reads on api.nuvemshop.com.br, the Scripts
 * API on api.tiendanube.com, token exchange on www.tiendanube.com.
 */
export const NUVEMSHOP_API_VERSION = "2025-03";
export const NUVEMSHOP_TOKEN_URL = "https://www.tiendanube.com/apps/authorize/token";

export type NuvemshopStatePayload = {
  iat?: number;
  return_to?: string;
  store_id?: string;
  user_id?: string;
};

export type NuvemshopTokenResponse = {
  access_token?: string;
  scope?: string;
  token_type?: string;
  user_id?: number | string;
};

export function nuvemshopApiBase(externalStoreId: string) {
  return `https://api.nuvemshop.com.br/${NUVEMSHOP_API_VERSION}/${externalStoreId}`;
}

export function nuvemshopScriptsApiBase(externalStoreId: string) {
  return `https://api.tiendanube.com/${NUVEMSHOP_API_VERSION}/${externalStoreId}/scripts`;
}

/** The originals fell back CLIENT_ID -> APP_ID -> "34355" (env has the default). */
export function nuvemshopAppId() {
  return env.NUVEMSHOP_CLIENT_ID || env.NUVEMSHOP_APP_ID;
}

/**
 * Signed OAuth state: `base64url(json).base64url(hmac-sha256)`, verified
 * with a 30-minute TTL — the exact format the edge functions exchanged.
 */
export function signNuvemshopState(
  payload: NuvemshopStatePayload,
  secret: string,
) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifyNuvemshopState(
  state: string,
  secret: string,
): NuvemshopStatePayload | null {
  const [encodedPayload, receivedSignature] = state.split(".");
  if (!encodedPayload || !receivedSignature) return null;

  const expectedSignature = createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
  const expected = Buffer.from(expectedSignature);
  const received = Buffer.from(receivedSignature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return null;
  }

  let payload: NuvemshopStatePayload;
  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as NuvemshopStatePayload;
  } catch {
    return null;
  }

  if (!payload.store_id || !payload.user_id) return null;
  if (payload.iat && Date.now() / 1000 - payload.iat > 60 * 30) return null;
  return payload;
}

export type NuvemshopApiResult = {
  ok: boolean;
  status: number;
  /** Body parsed as JSON when possible, `{}` otherwise (like the originals' `.json().catch(() => ({}))`). */
  data: unknown;
  /** Raw body text (the originals surface it in error details). */
  text: string;
  /** `Link` response header, used for product pagination. */
  linkHeader: string;
};

export async function nuvemshopRequest(
  url: string,
  init: {
    method?: string;
    headers: Record<string, string>;
    body?: unknown;
  },
): Promise<NuvemshopApiResult> {
  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers: init.headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await response.text().catch(() => "");
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // Non-JSON body; callers that care read `text`.
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
    text,
    linkHeader: response.headers.get("link") ?? "",
  };
}

export async function exchangeNuvemshopToken(code: string) {
  const result = await nuvemshopRequest(NUVEMSHOP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: {
      client_id: nuvemshopAppId(),
      client_secret: env.NUVEMSHOP_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    },
  });

  return { ...result, data: result.data as NuvemshopTokenResponse };
}
