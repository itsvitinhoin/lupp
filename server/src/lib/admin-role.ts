import { prisma } from "@/lib/prisma";

/**
 * Role-based console access: users.role = "admin" (base roles:
 * admin | manager | agent). Reads the role from the DB instead of the JWT
 * claim so promotions/demotions apply without waiting for a token refresh.
 */
export async function isAdminUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return user?.role === "admin";
}
