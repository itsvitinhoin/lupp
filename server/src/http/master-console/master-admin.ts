import { env } from "@/env";
import { prisma } from "@/lib/prisma";
import { clean } from "@/lib/text";
export { clean } from "@/lib/text";

export function adminEmails() {
  return new Set(
    env.MASTER_ADMIN_EMAILS.split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export type MasterAdmin = { email: string; id: string };

/**
 * The master-console gate the original performed after decoding the JWT:
 * the caller's account email must be in the MASTER_ADMIN_EMAILS allowlist.
 * Returns the original's machine-readable codes: 401 invalid_user when the
 * account row is gone, 403 master_access_denied when not allowlisted.
 */
export async function requireMasterAdmin(
  userId: string,
): Promise<{ admin: MasterAdmin } | { error: string; status: 401 | 403 }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });

  if (!user?.email) return { error: "invalid_user", status: 401 };

  const email = user.email.toLowerCase();
  if (!adminEmails().has(email)) return { error: "master_access_denied", status: 403 };

  return { admin: { email, id: user.id } };
}
