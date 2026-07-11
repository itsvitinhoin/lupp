import { prisma } from "@/lib/prisma";

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
