import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { AuthToken, AuthTokenPurpose } from "../../generated/prisma/client";

const TOKEN_TTL_MS: Record<AuthTokenPurpose, number> = {
  email_confirmation: 24 * 60 * 60 * 1000,
  password_reset: 60 * 60 * 1000,
};

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Issues a fresh single-use token for the user/purpose and returns the RAW
 * token (for the emailed link). Only its sha256 is stored; prior unconsumed
 * tokens of the same purpose are invalidated so the latest email always wins.
 */
export async function issueAuthToken(
  userId: string,
  purpose: AuthTokenPurpose,
): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const now = new Date();

  await prisma.$transaction([
    prisma.authToken.updateMany({
      where: { user_id: userId, purpose, consumed_at: null },
      data: { consumed_at: now },
    }),
    prisma.authToken.create({
      data: {
        user_id: userId,
        purpose,
        token_hash: hashToken(raw),
        expires_at: new Date(now.getTime() + TOKEN_TTL_MS[purpose]),
      },
    }),
  ]);

  return raw;
}

/**
 * Consumes a raw token: returns its row when it exists, matches the purpose,
 * is unexpired and unused — atomically marking it consumed so a token can
 * never be redeemed twice, even under concurrent requests.
 */
export async function consumeAuthToken(
  raw: string,
  purpose: AuthTokenPurpose,
): Promise<AuthToken | null> {
  const tokenHash = hashToken(raw);
  const now = new Date();

  const { count } = await prisma.authToken.updateMany({
    where: {
      token_hash: tokenHash,
      purpose,
      consumed_at: null,
      expires_at: { gt: now },
    },
    data: { consumed_at: now },
  });

  if (count !== 1) return null;

  return prisma.authToken.findUnique({ where: { token_hash: tokenHash } });
}
