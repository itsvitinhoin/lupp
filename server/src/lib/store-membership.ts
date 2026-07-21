import { prisma } from "@/lib/prisma";
import { isAdminUser } from "@/lib/admin-role";

/**
 * The access check every store-scoped edge function performed: the
 * authenticated user must have a store_members row for the store. Returns
 * the membership (null when absent) so handlers can reply
 * 403 { error: "store_access_denied" } exactly like the originals.
 */
export async function findStoreMembership(userId: string, storeId: string) {
  return prisma.storeMember.findUnique({
    where: { store_id_user_id: { store_id: storeId, user_id: userId } },
  });
}

/**
 * Membership OR the admin role. Used by provider
 * maintenance routes (product sync, script install) so the admin console can
 * operate any store without a store_members row.
 */
export async function canOperateStore(userId: string, storeId: string) {
  const member = await findStoreMembership(userId, storeId);
  if (member) return true;
  return isAdminUser(userId);
}
