import { prisma } from "@/lib/prisma";
export { clean } from "@/lib/text";

export type AdminUser = { email: string; id: string };

/**
 * The admin-console gate: the caller's account must hold the "admin" role
 * (base roles: admin | manager | agent). Role is read from the DB, not the
 * JWT claim, so a promotion/demotion applies immediately. Machine-readable
 * codes: 401 invalid_user when the account row is gone, 403
 * admin_access_denied for any non-admin role.
 */
export async function requireAdmin(
  userId: string,
): Promise<{ admin: AdminUser } | { error: string; status: 401 | 403 }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true },
  });

  if (!user?.email) return { error: "invalid_user", status: 401 };
  if (user.role !== "admin") return { error: "admin_access_denied", status: 403 };

  return { admin: { email: user.email.toLowerCase(), id: user.id } };
}
