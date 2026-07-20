import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed OAuth state: `base64url(json).base64url(hmac-sha256)`, verified
 * with a 30-minute TTL — the exact format the edge functions exchanged.
 */
export type NuvemshopStatePayload = {
  iat?: number;
  return_to?: string;
  store_id?: string;
  user_id?: string;
};

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
