import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { clean } from "@/lib/text";
import { ROLES, type Role } from "@/schemas/roles";

// Platform-wide user-management actions for the admin console Users tab.
// Unlike the store-scoped actions in actions.ts (which require store_id and
// only ever touch a store's own owner/members), these target any user
// directly by user_id and are dispatched from runAction() before the
// store_id requirement kicks in.

type ActionOutcome =
  | { result: Record<string, unknown> }
  | { error: string; status: 400 | 404 | 409 };

const MEMBER_ROLES = ["owner", "admin", "marketing", "editor", "analyst"] as const;
type MemberRole = (typeof MEMBER_ROLES)[number];

// Excludes visually-ambiguous characters (0/O, 1/l/I) for easier manual relay.
const PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function generatePassword(length = 14): string {
  let password = "";
  for (let i = 0; i < length; i++) {
    password += PASSWORD_ALPHABET[crypto.randomInt(PASSWORD_ALPHABET.length)];
  }
  return password;
}

export async function runSetUserRole(
  adminId: string,
  body: Record<string, unknown>,
): Promise<ActionOutcome> {
  const userId = clean(body.user_id);
  if (!userId) return { error: "missing_user_id", status: 400 };
  if (userId === adminId) return { error: "cannot_change_own_role", status: 400 };

  const role = clean(body.role) as Role;
  if (!ROLES.includes(role)) return { error: "invalid_role", status: 400 };

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return { error: "user_not_found", status: 404 };

  const updated = await prisma.user.update({ where: { id: userId }, data: { role } });
  return { result: { user: { id: updated.id, role: updated.role } } };
}

export async function runSetUserEmailConfirmed(
  _adminId: string,
  body: Record<string, unknown>,
): Promise<ActionOutcome> {
  const userId = clean(body.user_id);
  if (!userId) return { error: "missing_user_id", status: 400 };
  const confirmed = body.confirmed !== false;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return { error: "user_not_found", status: 404 };

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { email_confirmed_at: confirmed ? new Date() : null },
  });
  return {
    result: { user: { id: updated.id, email_confirmed_at: updated.email_confirmed_at } },
  };
}

export async function runResetUserPassword(
  _adminId: string,
  body: Record<string, unknown>,
): Promise<ActionOutcome> {
  const userId = clean(body.user_id);
  if (!userId) return { error: "missing_user_id", status: 400 };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!user) return { error: "user_not_found", status: 404 };

  const password = generatePassword();
  const password_hash = await bcrypt.hash(password, 6);
  await prisma.user.update({ where: { id: userId }, data: { password_hash } });

  // `password` is the only place the plaintext is ever visible — the caller
  // (runAction) strips it before writing the audit log row.
  return { result: { password, user: { id: user.id, email: user.email } } };
}

export async function runAddUserToStore(
  _adminId: string,
  body: Record<string, unknown>,
): Promise<ActionOutcome> {
  const userId = clean(body.user_id);
  const storeId = clean(body.target_store_id);
  if (!userId) return { error: "missing_user_id", status: 400 };
  if (!storeId) return { error: "missing_target_store_id", status: 400 };
  const role = (clean(body.role) || "admin") as MemberRole;
  if (!MEMBER_ROLES.includes(role)) return { error: "invalid_role", status: 400 };

  const [user, store] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
    prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, slug: true },
    }),
  ]);
  if (!user) return { error: "user_not_found", status: 404 };
  if (!store) return { error: "store_not_found", status: 404 };

  const existing = await prisma.storeMember.findUnique({
    where: { store_id_user_id: { store_id: storeId, user_id: userId } },
    select: { id: true },
  });
  if (existing) return { error: "already_member", status: 409 };

  const member = await prisma.storeMember.create({
    data: { store_id: storeId, user_id: userId, role },
  });
  return {
    result: {
      member: {
        id: member.id,
        role: member.role,
        store: { id: store.id, name: store.name, slug: store.slug },
      },
    },
  };
}

export async function runRemoveUserFromStore(
  _adminId: string,
  body: Record<string, unknown>,
): Promise<ActionOutcome> {
  const userId = clean(body.user_id);
  const storeId = clean(body.target_store_id);
  if (!userId) return { error: "missing_user_id", status: 400 };
  if (!storeId) return { error: "missing_target_store_id", status: 400 };

  const member = await prisma.storeMember.findUnique({
    where: { store_id_user_id: { store_id: storeId, user_id: userId } },
    select: { id: true, store: { select: { owner_id: true } } },
  });
  if (!member) return { error: "member_not_found", status: 404 };
  if (member.store.owner_id === userId) return { error: "cannot_remove_owner", status: 400 };

  await prisma.storeMember.delete({ where: { id: member.id } });
  return { result: { removed_member_id: member.id, store_id: storeId, user_id: userId } };
}
